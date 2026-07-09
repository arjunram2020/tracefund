/**
 * In-page mock wallet for Playwright sessions — no MetaMask extension needed.
 *
 * The injected EIP-1193 provider proxies every JSON-RPC request to the local
 * node. Signing works because hardhat node (and anvil) keep their first 20
 * mnemonic accounts UNLOCKED — eth_sendTransaction with `from` set to one of
 * them is signed node-side. The provider announces itself via EIP-6963 as
 * "Loadtest Wallet", so RainbowKit discovers it like any real injected wallet
 * and the full connect flow (modal, account, chain checks) runs for real.
 *
 * This is deliberately NOT a mock of wagmi — the app's entire wallet stack
 * (RainbowKit -> wagmi -> viem transport) executes unmodified.
 */
export function walletShimScript(opts: {
  address: string;
  rpcUrl: string;
  chainId: number;
}): string {
  const chainIdHex = "0x" + opts.chainId.toString(16);
  return `
(() => {
  const ADDRESS = ${JSON.stringify(opts.address.toLowerCase())};
  const RPC_URL = ${JSON.stringify(opts.rpcUrl)};
  const CHAIN_ID = ${JSON.stringify(chainIdHex)};
  let rpcId = 1;

  async function rpc(method, params) {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params: params ?? [] }),
    });
    const json = await res.json();
    if (json.error) {
      const err = new Error(json.error.message);
      err.code = json.error.code;
      err.data = json.error.data;
      throw err;
    }
    return json.result;
  }

  const listeners = new Map();
  const provider = {
    isLoadtestWallet: true,
    async request({ method, params }) {
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [ADDRESS];
        case "eth_chainId":
          return CHAIN_ID;
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          return null;
        case "wallet_requestPermissions":
          return [{ parentCapability: "eth_accounts" }];
        case "wallet_getPermissions":
          return [];
        case "eth_sendTransaction": {
          const tx = { ...(params && params[0]), from: ADDRESS };
          return rpc("eth_sendTransaction", [tx]); // node-side signing (unlocked account)
        }
        case "personal_sign":
        case "eth_sign":
        case "eth_signTypedData_v4":
          return rpc(method, params);
        default:
          return rpc(method, params);
      }
    },
    on(event, cb) {
      const set = listeners.get(event) ?? new Set();
      set.add(cb);
      listeners.set(event, set);
      return provider;
    },
    removeListener(event, cb) {
      listeners.get(event)?.delete(cb);
      return provider;
    },
  };

  window.ethereum = provider;

  // EIP-6963 discovery (what RainbowKit v2 actually listens for).
  const info = {
    uuid: "b9f3c1e2-6a67-4a10-9c8f-loadtest0001".slice(0, 36),
    name: "Loadtest Wallet",
    icon: "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#6d28d9"/><text x="16" y="22" font-size="16" text-anchor="middle" fill="#fff">L</text></svg>'),
    rdns: "dev.covenant.loadtest",
  };
  const announce = () => {
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: Object.freeze({ info, provider }),
      }),
    );
  };
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();
`;
}
