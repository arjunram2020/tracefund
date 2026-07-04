╭─── Claude Code v2.1.201 ─────────────────────────────────────────────────────╮
│                                                    │ Tips for getting        │
│                 Welcome back Nitu!                 │ started                 │
│                                                    │ Run /init to create a … │
│                       ▐▛███▜▌                      │ ─────────────────────── │
│                      ▝▜█████▛▘                     │ What's new              │
│                        ▘▘ ▝▝                       │ Claude Sonnet 5 sessio… │
│    Fable 5 · Claude Max ·                          │ Changed `AskUserQuesti… │
│    nityanth.maramreddy@gmail.com's Organization    │ Changed the "default" … │
│       ~/Downloads/tracefund/packages/nextjs        │ /release-notes for more │
╰──────────────────────────────────────────────────────────────────────────────╯

 ▎ Fable 5 is back.
 ▎ Until July 7, you can use up to 50% of your plan's weekly usage limit on Fable 5. If you hit your limit, you can continue on Fable 5 with usage credits. Fable 5 draws down usage faster than Opus 4.8. Learn more

❯ /model fable                                                                  
  ⎿  Set model to Fable 5 and saved as your default for new sessions

❯ /effort high                                                                  
  ⎿  Set effort level to high (saved as your default for new sessions):
     Comprehensive implementation with extensive testing and documentation

❯ Can you do a deep level of insight into figuring out why the gas fees are so  
  high? Is it just a matter of demand? Currently, my gas fees are going to be   
  $1 for even a 6-8 second network transfer if I were to make a transaction to  
  the blockchain. I'm not sure why this is, cause we're even using baseman,     
  which should be a cheaper version. What could be the underlying reason behind 
  this issue?                                                                   

⏺ I'll dig into this from two angles: what the current real gas conditions on
  Base are (via RPC), and how your code constructs transactions — because $1 on
  Base is way off from what it should cost (typically well under a cent), so
  something specific is likely inflating the estimate.

  Ran 1 shell command (ctrl+o to expand)

⏺ Explore(Find gas/tx config in repo)
  ⎿  Done (24 tool uses · 50.1k tokens · 2m 14s)
  (ctrl+o to expand)

  Ran 2 shell commands (ctrl+o to expand)

⏺ Found it. The short answer: it's not demand, and it's almost certainly not 
  real — your transactions on Base are actually costing 1–5 cents on-chain. The
  $1 figure is a wallet-side estimate artifact, and the most likely root cause
  in your setup is the wallet sitting on the wrong network when it quotes the
  fee.

  Here's the evidence chain:

  1. Base itself is nearly free right now. Live RPC query: base fee is 0.005
  gwei, and the latest block is only 5% full (20M of 400M gas), so there's zero
  congestion pressure. At these prices a simple transfer costs ~$0.0004 and a
  typical contract call ~$0.002.

  2. Your app doesn't set gas at all. I audited the whole repo — every write
  goes through wagmi's writeContractAsync
  (packages/nextjs/hooks/useCovenant.ts:187) with no gas, gasPrice, or fee
  fields, and the app never renders a fee estimate. So the $1 you're seeing is
  100% the wallet's (MetaMask/RainbowKit) own quote at signing time, not
  anything TraceFund computes.

  3. Your actual on-chain history confirms fees are cents. The two most recent
  transactions to your Covenant contract (0xe11CE…10F3):

  - Contract deployment, 2.3M gas → $0.05
  - A 680k-gas call yesterday → $0.014

  Those are your heaviest possible operations. Nothing you've actually paid has
  been anywhere near $1.

  So where does the $1 quote come from? Two likely culprits, in order of
  probability:

  Wrong network at quote time. Your wagmi config
  (packages/nextjs/lib/wagmi.ts:13) includes Ethereum mainnet (chain 1) in the
  wallet chain list alongside Base. If the wallet is on Ethereum when you open
  it and preview a transfer, a ~$1 quote for a contract-sized transaction is
  exactly what Ethereum mainnet costs — and the "6–8 second" estimate also
  smells more like Ethereum's 12-second blocks than Base's 2-second blocks. Your
  execute() does call switchChainAsync before writing, but a fee you preview
  manually (e.g., a plain transfer in MetaMask) gets quoted on whatever network
  the wallet is currently on. Next time you see the $1, check the network name
  at the top of the wallet popup first.

  "Max fee" vs. actual fee. Wallets often display the worst-case max fee (padded
  gas limit × an inflated maxFeePerGas fallback, since some estimators handle
  sub-0.01-gwei L2 fees poorly). On Base the actual charged fee ends up ~50–100×
  lower than that displayed max. Expand the fee details in MetaMask and compare
  "Estimated fee" against "Max fee" — and after sending, check the real fee on
  Basescan; it'll be pennies.

  If you want, I can drop Ethereum mainnet from ALL_CHAINS (it has no deployment
  anyway) so the wallet can never sit on chain 1 in the first place — that
  would eliminate the scariest version of this. For the demo, the honest
  takeaway is good news: your real per-transaction cost on Base is about a cent.

✻ Crunched for 3m 47s

※ recap: You asked why gas fees looked like $1; real cost on Base is 1-5 cents, and the quote likely came from the wallet sitting on Ethereum mainnet. Next: confirm if I should remove Ethereum from the chain list. (disable recaps in /config)

❯ Yeah, let's remove the chance because I was wondering: if it's a network      
  issue, why is it asking? Why is it not asking if it's bait? If the wallet is  
  being deployed on Ethereum mainnet, then that's a weird issue that should not 
  be happening. I literally explicitly said that our main network should be     
  Base mainnet. Can you basically drop the whole usage of Ethereum mainnet here 
  so that we can actually prevent the chance of gas fees or transaction fees    
  from being extremely high? This should not be optimal for how this should     
  look.                                                                         

⏺ I'll remove Ethereum mainnet from the app so the wallet can never quote or
  land on chain 1. Let me look at the config files first.

  Searched for 1 pattern, read 2 files (ctrl+o to expand)

⏺ The wallet-facing fix is wagmi.ts; a few other files reference chain 1 too.
  Let me check how they use it before removing.

  Searched for 1 pattern, read 4 files (ctrl+o to expand)

⏺ Update(lib/wagmi.ts)
  ⎿  Added 1 line, removed 1 line
      1  import { getDefaultConfig } from "@rainbow-me/rainbowkit";
      2  import { http } from "wagmi";
      3 -import { base, baseSepolia, hardhat, mainnet } from "wagmi/chain
        -s";                                                             
      3 +import { base, baseSepolia, hardhat } from "wagmi/chains";      
      4  import type { Chain } from "viem";
      5  import { defaultChainId } from "./contract";
      6  

⏺ Update(lib/wagmi.ts)
  ⎿  Added 4 lines, removed 1 line
      10  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT
          _ID || "covenant_local_demo";
      11  
      12  // Every network Covenant can target. The actual default is cho
          sen below.
      13 -const ALL_CHAINS: Chain[] = [base, baseSepolia, mainnet, hardha
         -t];                                                            
      13 +// Ethereum mainnet is deliberately excluded: Covenant only dep
         +loys to Base,                                                  
      14 +// and offering chain 1 in the wallet lets users preview/send t
         +ransactions at                                                 
      15 +// L1 gas prices (~100x Base). ENS lookups use a standalone rea
         +d client instead.                                              
      16 +const ALL_CHAINS: Chain[] = [base, baseSepolia, hardhat];      
      17  
      18  // Per-chain RPC overrides. The built-in public RPCs (e.g. http
          s://mainnet.base.org)
      19  // work but are rate-limited; a hosted multi-device demo should
           point at a dedicated

⏺ Update(lib/wagmi.ts)
  ⎿  Removed 1 line
      21  const RPC_OVERRIDES: Record<number, string | undefined> = {
      22    [base.id]: process.env.NEXT_PUBLIC_BASE_RPC_URL,
      23    [baseSepolia.id]: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_UR
          L,
      24 -  [mainnet.id]: process.env.NEXT_PUBLIC_MAINNET_RPC_URL,       
      24  };
      25  
      26  // Put the configured default chain (NEXT_PUBLIC_DEFAULT_CHAIN_
          ID, e.g. 8453 = Base)

⏺ Write(components/Address.tsx)
  ⎿  Added 26 lines, removed 7 lines
       1  "use client";
       2  
       3 -import { useEnsName } from "wagmi";                            
       4 -import { mainnet } from "wagmi/chains";                        
       3 +import { useQuery } from "@tanstack/react-query";              
       4 +import { createPublicClient, http } from "viem";               
       5 +import { mainnet } from "viem/chains";                         
       6  import { shortenAddress } from "../lib/format";
       7  
       8 +// ENS names live on Ethereum L1, but Covenant's wallet config 
         +is Base-only                                                   
       9 +// (chain 1 is excluded so users can never sign at L1 gas price
         +s). Resolve                                                    
      10 +// names through this standalone read-only client instead of th
         +e wagmi config.                                                
      11 +let ensClient: ReturnType<typeof createPublicClient> | undefine
         +d;                                                             
      12 +function getEnsClient() {                                      
      13 +  ensClient ??= createPublicClient({                           
      14 +    chain: mainnet,                                            
      15 +    transport: http(process.env.NEXT_PUBLIC_MAINNET_RPC_URL),  
      16 +  });                                                          
      17 +  return ensClient;                                            
      18 +}                                                              
      19 +                                                               
      20 +function useEnsNameReadOnly(address?: `0x${string}`) {         
      21 +  return useQuery({                                            
      22 +    queryKey: ["ensName", address],                            
      23 +    queryFn: () => getEnsClient().getEnsName({ address: address
         +! }),                                                          
      24 +    enabled: !!address,                                        
      25 +    staleTime: 5 * 60_000,                                     
      26 +    retry: false,                                              
      27 +  });                                                          
      28 +}                                                              
      29 +                                                               
      30  /**
      31   * Renders an address, preferring its ENS name when available (
          PRD §21 ENS).
      32   */
     ...
      39    className?: string;
      40    short?: boolean;
      41  }) {
      19 -  const { data: ensName } = useEnsName({                       
      20 -    address,                                                   
      21 -    chainId: mainnet.id,                                       
      22 -    query: { enabled: !!address },                             
      23 -  });                                                          
      42 +  const { data: ensName } = useEnsNameReadOnly(address);       
      43  
      44    if (!address) return <span className={className}>—</span>;
      45    const display = ensName ?? (short ? shortenAddress(address) :
           address);
⏺ Update(hooks/useActivity.ts)
  ⎿  Added 1 line, removed 1 line
       4  import { usePublicClient } from "wagmi";
       5  import { useQuery, useQueryClient } from "@tanstack/react-query
          ";
       6  import { createPublicClient, http, type Abi, type Chain, type P
          ublicClient } from "viem";
       7 -import { base, baseSepolia, hardhat, mainnet } from "wagmi/chai
         -ns";                                                           
       7 +import { base, baseSepolia, hardhat } from "wagmi/chains";     
       8  import { getDeployBlock } from "../lib/contract";
       9  import { useReadChain } from "./useCovenant";
      10  

⏺ Update(hooks/useActivity.ts)
  ⎿  Removed 1 line
      19  const SCAN_CHAINS: Record<number, Chain> = {
      20    [base.id]: base,
      21    [baseSepolia.id]: baseSepolia,
      22 -  [mainnet.id]: mainnet,                                       
      22    [hardhat.id]: hardhat,
      23  };
      24  const SCAN_RPC: Record<number, string | undefined> = {

⏺ Update(components/TxFeedback.tsx)
  ⎿  Removed 1 line
       6  const EXPLORERS: Record<number, string> = {
       7    8453: "https://basescan.org",
       8    84532: "https://sepolia.basescan.org",
       9 -  1: "https://etherscan.io",                                   
       9  };
      10  
      11  function Spinner() {

⏺ Update(components/ContractNotice.tsx)
  ⎿  Removed 1 line
       7    31337: "Hardhat localhost",
       8    84532: "Base Sepolia",
       9    8453: "Base Mainnet",
      10 -  1: "Ethereum Mainnet",                                       
      10  };
      11  
      12  /**

⏺ Update(~/Downloads/tracefund/packages/hardhat/hardhat.config.ts)
  ⎿  Added 3 lines, removed 6 lines
      30        url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia
          .base.org",
      31        accounts,
      32      },
      33 -    // Base Mainnet — the first production deployment target (s
         -ee PRD §9).                                                    
      33 +    // Base Mainnet — the production deployment target (see PRD
         + §9).                                                          
      34 +    // Ethereum mainnet is intentionally not configured: Covena
         +nt is Base-only,                                               
      35 +    // and an L1 deploy would cost ~100x in gas for no benefit.
      36      base: {
      37        url: process.env.BASE_RPC_URL || "https://mainnet.base.or
          g",
      38        accounts,
      39      },
      38 -    // Ethereum Mainnet — later production deployment.         
      39 -    mainnet: {                                                 
      40 -      url: process.env.MAINNET_RPC_URL || "https://eth.llamarpc
         -.com",                                                         
      41 -      accounts,                                                
      42 -    },                                                         
      40    },
      41    etherscan: {
      42      apiKey: {

⏺ Update(~/Downloads/tracefund/packages/hardhat/hardhat.config.ts)
  ⎿  Removed 1 line
      42      apiKey: {
      43        base: process.env.BASESCAN_API_KEY || "",
      44        baseSepolia: process.env.BASESCAN_API_KEY || "",
      45 -      mainnet: process.env.ETHERSCAN_API_KEY || "",            
      45      },
      46      customChains: [
      47        {

  Read 1 file (ctrl+o to expand)

⏺ Update(~/Downloads/tracefund/packages/hardhat/.env.example)
  ⎿  Added 1 line, removed 1 line
      1 -# Deployer private key for PUBLIC networks (Base / Ethereum). Ne
        -ver commit a real key.                                          
      1 +# Deployer private key for PUBLIC networks (Base). Never commit 
        +a real key.                                                     
      2  # Local development does not need this — Hardhat provides funded
          test accounts.
      3  DEPLOYER_PRIVATE_KEY=
      4  

⏺ Update(~/Downloads/tracefund/packages/hardhat/.env.example)
  ⎿  Added 1 line, removed 3 lines
      12  # Optional RPC overrides (sensible public defaults are used if 
          unset).
      13  BASE_RPC_URL=https://mainnet.base.org
      14  BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
      15 -MAINNET_RPC_URL=https://eth.llamarpc.com                       
      15  
      17 -# Optional: contract verification on Basescan / Etherscan.     
      16 +# Optional: contract verification on Basescan.                 
      17  BASESCAN_API_KEY=
      19 -ETHERSCAN_API_KEY=                                             

  Ran 1 shell command (ctrl+o to expand)

⏺ Only the intentional read-only ENS client remains. Running the typecheck:

  Ran 1 shell command (ctrl+o to expand)

⏺ Frontend typecheck is clean. Quick sanity check that the hardhat config still
  loads:

  Ran 1 shell command (ctrl+o to expand)

⏺ Done — Ethereum mainnet is now fully removed from anywhere the wallet (or a
  deploy script) could touch it. To answer your "why was it even asking"
  question: RainbowKit registers every chain in its config with the wallet, so
  even though your app always wrote to Base, the wallet was free to sit on
  Ethereum mainnet for anything you previewed manually — and quote L1 gas prices
  while doing it. That listing is what I removed.

  What changed:

  - packages/nextjs/lib/wagmi.ts — dropped mainnet from the chain list and RPC
  overrides. The wallet modal now only offers Base, Base Sepolia, and localhost;
  there is no chain-1 entry for a wallet to land on, with a comment explaining
  why so nobody re-adds it.
  - packages/nextjs/components/Address.tsx — the one legitimate chain-1 use was
  ENS name lookups (ENS lives on Ethereum L1). That would have broken, so I
  rewired it to a standalone read-only viem client outside the wallet config.
  It's purely a display read — no wallet involvement, no signing, no gas — so
  ENS names still render.
  - packages/nextjs/hooks/useActivity.ts — removed mainnet from the log-scan
  chain map.
  - packages/nextjs/components/TxFeedback.tsx and ContractNotice.tsx — removed
  the Etherscan link and "Ethereum Mainnet" label entries for chain 1.
  - packages/hardhat/hardhat.config.ts — deleted the mainnet deploy network and
  its Etherscan API key, so --network mainnet is no longer even a valid deploy
  target. Cleaned the matching lines out of .env.example.

  Verified: frontend typecheck passes with no errors, and the hardhat config
  still loads (hardhat compile runs clean).

  One caveat to be aware of: this stops the app from offering Ethereum, but if
  you open MetaMask on its own and it happens to be on Ethereum, a plain
  transfer you initiate from inside the wallet will still be quoted at L1 prices
  — no dapp can control that. Within TraceFund flows, though, every quote and
  every transaction is now Base-only, so you should see fees in the ~$0.01–0.05
  range that your on-chain history already shows.

✻ Worked for 3m 7s

※ recap: We diagnosed your $1 gas quotes (wallet sitting on Ethereum mainnet, not Base demand) and removed Ethereum mainnet from the app's wallet config and deploy targets; all checks pass. Next: retest a transaction to confirm cent-level fees. (disable recaps in /config)

❯ Okay, so currently with this deployment, Base mainnet is not able to accept   
  USDC, which is really weird because the contract was constructed with the     
  idea that we're using Base, we're using USDC to do this. There's no bytecode  
  to Base mainnet, so that means that there's an incorrect address being used,  
  right? Since that token address is not mutable, we need to correct it and we  
  need to add deployment time, and we need to redeploy Covenant and update this 
  frontend metadata.                                                            
                                                                                
  The current contract has two campaigns, but both have raise and release zero. 
  That's basically classifying the deployment as active because it only checks  
  the ABI shape, not whether the configured token is active and valid, the      
  token we're supposed to use or the crypto we're supposed to use is USDC, not  
  Ethereum. Check the codebase and, if this is still an issue, can you fix this 
  and, if so, please do this now and then also                                  

⏺ I'll verify the on-chain state first — what USDC address the deployed Covenant
  was actually constructed with, and whether that address has bytecode — before
  touching anything.

  Searched for 1 pattern, ran 3 shell commands (ctrl+o to expand)

⏺ Background command "Search Blockscout for canonical USDC token on Base" failed
with exit code 1
⏺ My first candidate is wrong too — I need an authoritative source rather than
  memory. Let me check the failed search and query Circle's official docs:

  Searched for 2 patterns, read 4 files, listed 1 directory, ran 3 shell commands (ctrl+o to expand)

⏺ Update(~/Downloads/tracefund/packages/hardhat/scripts/deploy.ts)
  ⎿  Added 30 lines, removed 1 line
      16   */
      17  
      18  // Canonical USDC addresses per chain. Anything not listed gets
           a MockUSDC.
      19 +// Source: Circle / Superchain token list. Verify against      
      20 +// https://developers.circle.com/stablecoins/usdc-on-main-netwo
         +rks before editing.                                            
      21  const USDC_ADDRESSES: Record<number, string> = {
      20 -  8453: "0x833589fcB6E61E26EE7660cE1C83e66bc46d47c9", // Base M
         -ainnet (native USDC)                                           
      22 +  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base M
         +ainnet (native USDC)                                           
      23    84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base 
          Sepolia (Circle testnet USDC)
      24  };
      25  
      26 +/**                                                            
      27 + * The token address is immutable in Covenant, so a wrong const
         +ant above bricks                                               
      28 + * the whole deployment (every donate()/release reverts against
         + an address with                                               
      29 + * no code). Refuse to deploy unless the address hosts a 6-deci
         +mal USDC token                                                 
      30 + * on the target network.                                      
      31 + */                                                            
      32 +async function assertLooksLikeUsdc(address: string) {          
      33 +  const code = await ethers.provider.getCode(address);         
      34 +  if (code === "0x") {                                         
      35 +    throw new Error(                                           
      36 +      `No contract bytecode at USDC address ${address} on this 
         +network — refusing to deploy Covenant against it.`,            
      37 +    );                                                         
      38 +  }                                                            
      39 +  const erc20 = new ethers.Contract(                           
      40 +    address,                                                   
      41 +    ["function symbol() view returns (string)", "function decim
         +als() view returns (uint8)"],                                  
      42 +    ethers.provider,                                           
      43 +  );                                                           
      44 +  const [symbol, decimals] = await Promise.all([erc20.symbol(),
         + erc20.decimals()]);                                           
      45 +  if (Number(decimals) !== 6 || !String(symbol).toUpperCase().i
         +ncludes("USDC")) {                                             
      46 +    throw new Error(                                           
      47 +      `Token at ${address} reports symbol=${symbol}, decimals=$
         +{decimals}; expected USDC with 6 decimals — refusing to deploy.
         +`,                                                             
      48 +    );                                                         
      49 +  }                                                            
      50 +  console.log(`  verified USDC: symbol=${symbol}, decimals=${de
         +cimals}, bytecode present`);                                   
      51 +}                                                              
      52 +                                                               
      53  async function main() {
      54    const [deployer] = await ethers.getSigners();
      55    const net = await ethers.provider.getNetwork();

⏺ Update(~/Downloads/tracefund/packages/hardhat/scripts/deploy.ts)
  ⎿  Added 1 line
      64    let usdcAddress = USDC_ADDRESSES[chainId];
      65    if (usdcAddress) {
      66      console.log(`Using canonical USDC at ${usdcAddress}`);
      67 +    await assertLooksLikeUsdc(usdcAddress);                    
      68    } else {
      69      const MockFactory = await ethers.getContractFactory("MockUS
          DC");
      70      const mock = await MockFactory.deploy();

⏺ Update(lib/contract.ts)
  ⎿  Added 1 line, removed 1 line
      12  // (e.g. a deployment made before USDC support). Local chains a
          lways record
      13  // their MockUSDC address at deploy time.
      14  const CANONICAL_USDC: Record<number, `0x${string}`> = {
      15 -  8453: "0x833589fcB6E61E26EE7660cE1C83e66bc46d47c9", // Base M
         -ainnet (native USDC)                                           
      15 +  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base M
         +ainnet (native USDC)                                           
      16    84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base 
          Sepolia (Circle testnet USDC)
      17  };
      18  

⏺ Write(components/ContractNotice.tsx)
  ⎿  Added 38 lines, removed 2 lines
      1  "use client";
      2  
      3 +import { usePublicClient } from "wagmi";                        
      4 +import { useQuery } from "@tanstack/react-query";               
      5  import { useReadChain } from "../hooks/useCovenant";
      4 -import { activeChainIds } from "../lib/contract";               
      6 +import { activeChainIds, getUsdcAddress } from "../lib/contract"
        +;                                                               
      7  
      8  const CHAIN_NAMES: Record<number, string> = {
      9    31337: "Hardhat localhost",
     ...
      13  
      14  /**
      15   * Friendly banner shown when Covenant has no deployment on the
           resolved chain
      14 - * (e.g. the wallet is on an unsupported network).             
      16 + * (e.g. the wallet is on an unsupported network), or when the 
         +deployment is                                                  
      17 + * present but unusable because its settlement token doesn't ex
         +ist on-chain.                                                  
      18   */
      19  export function ContractNotice() {
      20    const { connectedChainId, connectedMode, chainId, mode } = us
          eReadChain();
      21 +                                                               
      22 +  // ABI shape alone can't tell a working deployment from a bri
         +cked one: the                                                  
      23 +  // USDC address is immutable in Covenant, and if nothing is d
         +eployed at it                                                  
      24 +  // every donate()/release reverts. Verify the token has bytec
         +ode on-chain.                                                  
      25 +  const client = usePublicClient({ chainId });                 
      26 +  const usdcAddress = getUsdcAddress(chainId);                 
      27 +  const { data: usdcHasCode } = useQuery({                     
      28 +    queryKey: ["usdcBytecode", chainId, usdcAddress],          
      29 +    queryFn: async () => {                                     
      30 +      const code = await client!.getCode({ address: usdcAddress
         +! });                                                          
      31 +      return !!code && code !== "0x";                          
      32 +    },                                                         
      33 +    enabled: mode === "active" && !!client && !!usdcAddress,   
      34 +    staleTime: Infinity,                                       
      35 +    retry: 1,                                                  
      36 +  });                                                          
      37 +                                                               
      38 +  if (mode === "active" && usdcHasCode === false) {            
      39 +    return (                                                   
      40 +      <div className="card border-red-600/30 bg-red-600/[0.06] 
         +p-4 text-sm text-red-200">                                     
      41 +        <p className="font-medium">                            
      42 +          This Covenant deployment is misconfigured: no USDC to
         +ken exists at{" "}                                             
      43 +          <span className="font-mono">{usdcAddress}</span> on{"
         + "}                                                            
      44 +          {CHAIN_NAMES[chainId] ?? `chain ${chainId}`}.        
      45 +        </p>                                                   
      46 +        <p className="mt-1 text-red-700/90">                   
      47 +          The token address is baked into the contract at deplo
         +y time, so donations and milestone                             
      48 +          releases will revert until Covenant is redeployed aga
         +inst the real USDC token.                                      
      49 +        </p>                                                   
      50 +      </div>                                                   
      51 +    );                                                         
      52 +  }                                                            
      53 +                                                               
      54    if (connectedChainId != null && connectedMode === "legacy") {
      55      return (
      56        <div className="card border-amber-600/30 bg-amber-600/[0.
          06] p-4 text-sm text-amber-200">

⏺ Now redeploying Covenant to Base mainnet with the corrected, validated USDC
  address (costs ~$0.05 in gas):

  Ran 2 shell commands (ctrl+o to expand)

⏺ Everything checks out on-chain. Running the frontend typecheck on the changed
  files:

  Ran 1 shell command (ctrl+o to expand)

⏺ Typecheck is clean. Let me update the memory file that tracks the contract
  state, since the live address changed:

  Recalled 2 memories, wrote 4 memories (ctrl+o to expand)

⏺ All done — you were exactly right, and it's fixed and redeployed. Here's the
  full picture:

  Confirmed diagnosis. The old Covenant's immutable usdc() pointed at
  0x833589fcB6E61E26EE7660cE1C83e66bc46d47c9, which has zero bytecode on Base.
  The real canonical Base USDC is 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 —
  the repo's address was a look-alike sharing the 0x833589fC prefix but
  diverging after. Since SafeERC20 refuses to call a codeless address, every
  donate() reverted, which is why both campaigns sat at zero raised. I verified
  the correct address two independent ways before using it: the official
  Superchain token list, and directly on-chain (1,852 bytes of code, symbol
  USDC, name USD Coin, 6 decimals, $4.28B supply). The Base Sepolia address in
  the repo was always correct — only mainnet was wrong.

  Fixes applied:
  - packages/hardhat/scripts/deploy.ts — corrected the address, and added a
  deploy-time guard (assertLooksLikeUsdc) that refuses to deploy unless the
  token address has bytecode, its symbol contains "USDC", and decimals are 6.
  This bug class can't recur silently.
  - packages/nextjs/lib/contract.ts — corrected the same bad address in the
  CANONICAL_USDC fallback.
  - packages/nextjs/components/ContractNotice.tsx — addressed your "it only
  checks ABI shape" point: the app now does a live bytecode check on the
  configured USDC token and shows a red "this deployment is misconfigured,
  donations will revert" banner instead of presenting a bricked deployment as
  active.

  Redeployed and verified. New Covenant is live at
  0x8845627E7f566033Ab50E882aEd523baAD7489E7 (block 48206393, deploy cost
  ~$0.05, deployer has ~0.0011 ETH left). I confirmed on-chain that the new
  contract's immutable usdc() returns the real USDC address,
  deployedContracts.json was regenerated with the new Covenant + correct USDC,
  and the frontend typechecks clean.

  Two follow-ups to be aware of: the two old campaigns live on the bricked
  contract and don't migrate — they'll need re-creating on the new contract
  (nothing was raised, so nothing is lost); and the EC2-hosted site and its
  indexer still have the old address baked in, so the hosted demo needs a
  frontend rebuild plus an ~/indexer/.env update to pick this up. Your message
  also cut off at "and then also" — tell me what the rest was and I'll take care
  of it.

✻ Cogitated for 8m 49s
※ recap: Fixing TraceFund's broken Base mainnet USDC setup: Covenant was redeployed at 0x8845627E... with the correct USDC address, verified on-chain, frontend metadata updated. Next: rebuild the EC2 site and indexer so the hosted demo uses the new contract. (disable recaps in /config)

❯ You are working inside the TraceFund / Covenant codebase. Read the existing   
  architecture first, then implement the requested changes without breaking the 
  current app flow.                                                             
                                                                                
  Project context:                                                              
  - Smart contract lives in `packages/hardhat/contracts/Covenant.sol`           
  - Frontend lives in `packages/nextjs`                                         
  - Campaign creation UI lives in `packages/nextjs/app/create/page.tsx`         
  - Evidence submission UI lives in                                             
  `packages/nextjs/components/EvidencePanel.tsx`                                
  - Deployment logic lives in `packages/hardhat/scripts/deploy.ts`              
  - Research notes live in `docs/COVENANT_RESEARCH_GAPS.md`                     
                                                                                
  Important existing behavior to preserve unless explicitly replaced:           
  - This is a milestone-based USDC escrow product                               
  - Donors fund a campaign                                                      
  - Funds are released milestone by milestone                                   
  - The app already has campaign creation, donation, milestone display, and     
  evidence submission                                                           
  - The frontend expects deployed contract metadata exported from Hardhat       
  - Do not break the current read paths, activity/history displays, or          
  deployment export flow                                                        
                                                                                
  What to ignore for now:                                                       
  - Save issue numbers 10 and 12 for later                                      
  - Do not expand into broad narrative-positioning work or unrelated research   
  tasks                                                                         
  - Stay focused on the product and engineering changes below                   
                                                                                
  High-level product direction:                                                 
  We are improving the proof / milestone / approval system so that the app      
  works for both:                                                               
  1. consumer / charity fundraising                                             
  2. B2B / startup / VC / grant-style review flows                              
                                                                                
  The core principle is:                                                        
  - evidence can stay flexible                                                  
  - milestone criteria cannot stay vague                                        
  - approval authority must be configurable                                     
  - sensitive evidence should not be dumped publicly on-chain                   
  - the creator must have a clean way to submit multiple pieces of proof        
  - reviewers must be able to approve, reject, and request revision             
  - refunds / deadlines / disappearance handling must exist                     
                                                                                
  Main product decisions to implement:                                          
                                                                                
  1. Add configurable approval authority                                        
  The system must support configurable approval per campaign or per program.    
  Possible approval models:                                                     
  - all donors                                                                  
  - lead donor                                                                  
  - lead investor / VC partner                                                  
  - investment committee                                                        
  - grant administrator                                                         
  - platform operator                                                           
  - designated third-party reviewers                                            
                                                                                
  Implementation requirement:                                                   
  - design this so approval authority is explicit in campaign configuration and 
  milestone review logic                                                        
  - consumer / charity flows can default to donor approval                      
  - institutional / VC / grant flows can use designated reviewers               
  - do not hardcode one universal approval model                                
                                                                                
  2. Add milestone acceptance criteria                                          
  Milestones curre                                                              
  ──── (290 lines hidden) ───────────────────────────────────────────────────── 
  - attestation pointer                                                         
    - minimal public metadata                                                   
  - Add role-aware UI assumptions where possible                                
  - If full auth/storage infrastructure is out of scope, implement the safe     
  boundary and document what remains external                                   
                                                                                
  Deployment directives:                                                        
  - Keep `packages/hardhat/scripts/deploy.ts` verification safeguards intact or 
  stronger                                                                      
  - Ensure contract exports remain compatible with the frontend                 
  - If redeploy is required due to storage/function signature changes, say so   
  clearly in the final summary                                                  
  - Do not regress USDC verification logic                                      
                                                                                
  Testing directives:                                                           
  - Update Hardhat tests to match the new approval and release flow             
  - Add tests for:                                                              
    - proof submission without auto-release                                     
    - reviewer approval causing release                                         
    - rejection preserving escrow                                               
    - resubmission after rejection                                              
    - deadline timeout behavior                                                 
    - refund behavior                                                           
    - reputation only after verified approval                                   
    - permission checks for approvers/reviewers                                 
  - Update any frontend logic tests if present                                  
  - Remove or rewrite tests that encode the old auto-release assumption         
                                                                                
  Documentation/output directives:                                              
  - After implementing, provide:                                                
    1. concise summary of architecture changes                                  
    2. files changed                                                            
    3. whether redeploy is required                                             
    4. deferred items                                                           
    5. known risks / next steps                                                 
  - Do not spend tokens on broad product commentary                             
  - Focus on implementation, migrations, and what remains unfinished            
                                                                                
  Decision directives:                                                          
  - If one-pass implementation of full private evidence storage is too large,   
  choose the smallest safe architecture that avoids misleading public-on-chain  
  storage claims                                                                
  - If configurable approval per campaign is simpler than introducing           
  program-level config right now, implement per-campaign first but structure it 
  so program-level config can be added later                                    
  - If donor-wide voting is too large for the first pass, implement a clean     
  designated-reviewer model plus approval-model enum scaffolding, then document 
  donor-voting as the next extension                                            
  - Prefer correct extensible architecture over fake completeness               
                                                                                
  Non-goals for this pass:                                                      
  - do not implement issues 10 and 12 from the broader research list            
  - do not add unrelated redesigns                                              
  - do not preserve old behavior if that behavior contradicts the new           
  proof/review model                                                            
                                                                                
  Execution mode:                                                               
  - inspect                                                                     
  - decide                                                                      
  - implement                                                                   
  - test                                                                        
  - summarize                                                                   
                                                                                
  Do not ask for permission to make normal in-repo code changes. Start          
  coding.Read through this master prompt and let me know if all this makes      
  sense. If it does, then go on and build this right. Ask me questions as       
  needed.                                                                       

⏺ The brief makes sense and is well-scoped — the decision directives already
  resolve the big forks (designated-reviewer first with approval-model
  scaffolding, manifest-hash boundary for privacy, adapter-based AI drafting).
  I'll state my key code-level decisions as I go and flag anything that
  genuinely needs your call. One thing I can tell you upfront: this will require
  a redeploy (storage layout and function signatures change fundamentally) —
  I'll implement and test everything, and you can tell me when to pull the
  trigger on Base mainnet.

  Let me set up tracking and read the current code first.

  Searched for 1 pattern, read 12 files, listed 1 directory (ctrl+o to expand)

⏺ I now have the full picture of the existing architecture. Let me check the
  last few dependents (seed script, DonationPanel, CampaignCard, history) before
  writing the new contract:

  Searched for 1 pattern, read 1 file (ctrl+o to expand)

⏺ Write(~/Downloads/tracefund/packages/hardhat/contracts/Covenant.sol)
  ⎿  Added 467 lines, removed 53 lines
       8  
       9  /**
      10   * @title Covenant
      11 - * @notice Milestone-based crowdfunding with on-chain evidence 
         -gates.                                                         
      11 + * @notice Milestone-based USDC escrow with explicit acceptance
         + criteria,                                                     
      12 + *         reviewer-gated releases, and donor refunds.         
      13   *
      14   * All value flows in USDC (an ERC-20 with 6 decimals); every a
          mount in this
      15   * contract is denominated in USDC base units. Donors must appr
          ove() this
     ...
      17   *
      18   * Flow per milestone:
      19   *   1. Donors send USDC into escrow via donate() (after approv
          ing it).
      19 - *   2. Once donations cover the milestone, the creator posts o
         -n-chain proof via                                              
      20 - *      submitEvidence() for the current milestone.            
      21 - *   3. Funds are automatically released to the creator and the
         - next milestone begins.                                        
      20 + *   2. Once donations cover the milestone, the creator submits
         + a proof                                                       
      21 + *      package via submitProof(). This does NOT release funds.
      22 + *   3. The campaign's configured reviewers evaluate the proof 
         +against the                                                    
      23 + *      milestone's acceptance criteria and approve or reject i
         +t.                                                             
      24 + *   4. Funds release only when the approval threshold is met. 
         +On rejection                                                   
      25 + *      the creator revises and resubmits; escrow stays locked.
      26   *
      23 - * A milestone can only release once this campaign's own donati
         -ons cover it                                                   
      24 - * (totalReleased + amount <= totalRaised), so one campaign can
         - never be paid                                                 
      25 - * out of another campaign's escrow.                           
      27 + * Approval authority is configured per campaign (designated re
         +viewers /                                                      
      28 + * committee, lead donor, or platform operator). Donor-wide vot
         +ing is                                                         
      29 + * reserved in the ApprovalModel enum but not yet implemented. 
      30 + *                                                             
      31 + * Evidence privacy boundary: the chain stores a short public s
         +ummary plus a                                                  
      32 + * keccak256 hash of the full proof-package manifest (and, only
         + when the                                                      
      33 + * creator opts in, a public manifest URI). Sensitive raw evide
         +nce is never                                                   
      34 + * required to live on-chain; the hash lets any reviewer verify
         + an off-chain                                                  
      35 + * package byte-for-byte.                                      
      36 + *                                                             
      37 + * Failure handling: each milestone can carry a proof deadline.
         + If the                                                        
      38 + * creator misses it (or reviewers go silent past a grace windo
         +w), anyone can                                                 
      39 + * cancel the campaign and every donor can reclaim their share 
         +of the                                                         
      40 + * unreleased escrow. A milestone can only release from this ca
         +mpaign's own                                                   
      41 + * donations (totalReleased + amount <= totalRaised), so one ca
         +mpaign can                                                     
      42 + * never be paid out of another campaign's escrow.             
      43   */
      44  contract Covenant is ReentrancyGuard, Ownable {
      45      using SafeERC20 for IERC20;
      46  
      47      uint256 public constant MAX_MILESTONES = 5;
      48 +    uint256 public constant MAX_REVIEWERS = 7;                 
      49 +    /// @notice Grace period reviewers get past the proof deadl
         +ine while a                                                    
      50 +    ///         submission is pending review, before the campai
         +gn can be failed.                                              
      51 +    uint256 public constant REVIEW_WINDOW = 14 days;           
      52  
      53      // Anti-spam limits. Campaign creation is nearly free on an
           L2, so an
      54      // unapproved address gets a small lifetime allowance and a
           cooldown;
     ...
       63      /// @notice Last createCampaign timestamp per creator, for
            the cooldown.
       64      mapping(address => uint256) public lastCampaignAt;
       65  
       45 -    /// @notice The ERC-20 token (USDC) all donations and rele
          -ases are settled in.                                          
       66 +    /// @notice The ERC-20 token (USDC) all donations, release
          +s and refunds settle in.                                      
       67      IERC20 public immutable usdc;
       68  
       69 +    // -------------------------------------------------------
          +------------------                                            
       70 +    // Data model                                             
       71 +    // -------------------------------------------------------
          +------------------                                            
       72 +                                                              
       73 +    /// @notice Who has the authority to approve milestone pro
          +of.                                                           
       74 +    enum ApprovalModel {                                      
       75 +        DesignatedReviewers, // explicit reviewer set + thresh
          +old (committee when threshold > 1)                            
       76 +        LeadDonor,           // the campaign's largest donor a
          +t review time                                                 
       77 +        PlatformOperator,    // the contract owner (grant admi
          +nistrator / platform)                                         
       78 +        DonorVote            // reserved: donor-wide voting — 
          +not yet implemented                                           
       79 +    }                                                         
       80 +                                                              
       81 +    /// @notice Review lifecycle of a single milestone. "Expir
          +ed" is derived                                                
       82 +    ///         from the deadline in views, not stored.       
       83 +    enum MilestoneState {                                     
       84 +        Pending,          // no proof submitted yet           
       85 +        Submitted,        // proof awaiting review            
       86 +        ChangesRequested, // rejected with notes; creator may 
          +revise and resubmit                                           
       87 +        Approved          // threshold met, funds released    
       88 +    }                                                         
       89 +                                                              
       90 +    /// @notice Campaign flavor. Only used by clients (default
          +s, drafting); the                                             
       91 +    ///         contract applies identical rules to every kind
          +.                                                             
       92 +    enum CampaignKind {                                       
       93 +        Charity,                                              
       94 +        Startup,                                              
       95 +        Grant,                                                
       96 +        Other                                                 
       97 +    }                                                         
       98 +                                                              
       99 +    /// @notice What the reviewer is evaluating. Evidence stay
          +s flexible; the                                               
      100 +    ///         acceptance criteria cannot stay vague.        
      101 +    struct MilestoneCriteria {                                
      102 +        string title;             // short label, e.g. "Hospit
          +al deposit paid"                                              
      103 +        string successDefinition; // what "done" means, in pla
          +in language                                                   
      104 +        string reportingPeriod;   // e.g. "every 2 weeks", "on
          +ce, by distribution day"                                      
      105 +        string expectedMetrics;   // e.g. "500 MAU, 20% retent
          +ion" ("" if n/a)                                              
      106 +        string requiredProof;     // e.g. "receipts, analytics
          + screenshots"                                                 
      107 +        uint64 proofDeadline;     // unix seconds; 0 = no dead
          +line (no timeout path)                                        
      108 +    }                                                         
      109 +                                                              
      110      struct Milestone {
       49 -        string description;                                   
       50 -        uint256 amount;                                       
       51 -        string evidence;                                      
       52 -        bool evidenceSubmitted;                               
      111 +        MilestoneCriteria criteria;                           
      112 +        uint256 amount;           // USDC released when approv
          +ed                                                            
      113 +        MilestoneState state;                                 
      114 +        uint32 submissionCount;   // proof packages submitted 
          +so far                                                        
      115 +        uint8 approvalCount;      // approvals for the latest 
          +submission                                                    
      116          bool released;
      117      }
      118  
      119 +    /// @notice One proof package. The full package (narrative
          +, justification,                                              
      120 +    ///         metrics, evidence links) lives off-chain; the 
          +chain keeps its                                               
      121 +    ///         hash, an optional public pointer, and a short 
          +public summary.                                               
      122 +    struct ProofSubmission {                                  
      123 +        bytes32 manifestHash; // keccak256 of the canonical ma
          +nifest JSON                                                   
      124 +        string manifestURI;   // optional public pointer (data
          +:/https/ipfs); "" = private                                   
      125 +        string summary;       // short, non-sensitive, public 
      126 +        uint64 submittedAt;                                   
      127 +    }                                                         
      128 +                                                              
      129 +    struct ReviewDecision {                                   
      130 +        address reviewer;                                     
      131 +        bool approved;                                        
      132 +        string notes;           // required when rejecting    
      133 +        uint64 decidedAt;                                     
      134 +        uint32 submissionIndex; // which proof package this de
          +cision reviewed                                               
      135 +    }                                                         
      136 +                                                              
      137 +    struct ApprovalConfig {                                   
      138 +        ApprovalModel model;                                  
      139 +        address[] reviewers; // only for DesignatedReviewers  
      140 +        uint8 threshold;     // approvals needed to release (1
          + for single-reviewer models)                                  
      141 +    }                                                         
      142 +                                                              
      143 +    /// @notice createCampaign input for one milestone.       
      144 +    struct MilestoneInput {                                   
      145 +        MilestoneCriteria criteria;                           
      146 +        uint256 amount;                                       
      147 +    }                                                         
      148 +                                                              
      149      struct Campaign {
      150          uint256 id;
      151          address creator;
      152          string title;
      153          string description;
      154 +        CampaignKind kind;                                    
      155          uint256 goalAmount;
      156          uint256 totalRaised;
      157          uint256 totalReleased;
      158          bool active;
      159          bool completed;
      160 +        uint64 cancelledAt; // 0 = not cancelled; set on volun
          +tary cancel or deadline failure                               
      161          uint256 currentMilestone;
      162          uint256 createdAt;
      163          uint256 donorCount;
     ...
      169          uint256 campaignsCompleted;
      170          uint256 totalRaised;
      171          uint256 totalReleased;
       77 -        uint256 milestonesCompleted;                          
       78 -        uint256 evidenceUpdates;                              
      172 +        uint256 milestonesApproved; // verified by reviewers —
          + drives reputation                                            
      173 +        uint256 proofSubmissions;   // informational only; nev
          +er scores                                                     
      174      }
      175  
      176      uint256 public campaignCount;
      177  
      178      mapping(uint256 => Campaign) private _campaigns;
      179      mapping(uint256 => Milestone[]) private _milestones;
      180 +    mapping(uint256 => ApprovalConfig) private _approvals;    
      181 +    mapping(uint256 => mapping(uint256 => ProofSubmission[])) 
          +private _submissions;                                         
      182 +    mapping(uint256 => mapping(uint256 => ReviewDecision[])) p
          +rivate _reviews;                                              
      183 +    // campaignId => milestoneIndex => submissionIndex => revi
          +ewer => voted                                                 
      184 +    mapping(uint256 => mapping(uint256 => mapping(uint256 => m
          +apping(address => bool))))                                    
      185 +        private _reviewed;                                    
      186      mapping(uint256 => mapping(address => uint256)) public don
           ations;
      187      mapping(uint256 => address[]) private _donors;
      188 +    /// @notice Largest single donor per campaign — the approv
          +er under LeadDonor.                                           
      189 +    mapping(uint256 => address) public leadDonor;             
      190      mapping(address => CreatorStats) private _creatorStats;
      191  
      192 +    // -------------------------------------------------------
          +------------------                                            
      193 +    // Events                                                 
      194 +    // -------------------------------------------------------
          +------------------                                            
      195 +                                                              
      196      event CampaignCreated(
      197          uint256 indexed campaignId,
      198          address indexed creator,
     ...
      206          uint256 amount,
      207          uint256 totalRaised
      208      );
      102 -    event EvidenceSubmitted(                                  
      209 +    event ProofSubmitted(                                     
      210          uint256 indexed campaignId,
      211          uint256 indexed milestoneIndex,
      105 -        string evidence                                       
      212 +        uint256 submissionIndex,                              
      213 +        bytes32 manifestHash,                                 
      214 +        string summary                                        
      215      );
      216 +    event ProofReviewed(                                      
      217 +        uint256 indexed campaignId,                           
      218 +        uint256 indexed milestoneIndex,                       
      219 +        address indexed reviewer,                             
      220 +        uint256 submissionIndex,                              
      221 +        bool approved,                                        
      222 +        string notes                                          
      223 +    );                                                        
      224      event MilestoneReleased(
      225          uint256 indexed campaignId,
      226          uint256 indexed milestoneIndex,
     ...
      228          address creator
      229      );
      230      event CampaignCompleted(uint256 indexed campaignId);
      231 +    event CampaignCancelled(                                  
      232 +        uint256 indexed campaignId,                           
      233 +        uint256 milestoneIndex,                               
      234 +        bool voluntary                                        
      235 +    );                                                        
      236 +    event RefundClaimed(uint256 indexed campaignId, address in
          +dexed donor, uint256 amount);                                 
      237      event CreatorApprovalChanged(address indexed creator, bool
            approved);
      238  
      239      modifier campaignExists(uint256 campaignId) {
     ...
      259      function createCampaign(
      260          string calldata title,
      261          string calldata description,
      139 -        string[] calldata milestoneDescriptions,              
      140 -        uint256[] calldata milestoneAmounts                   
      262 +        CampaignKind kind,                                    
      263 +        ApprovalConfig calldata approval,                     
      264 +        MilestoneInput[] calldata items                       
      265      ) external returns (uint256 campaignId) {
      266          if (!approvedCreators[msg.sender]) {
      267              require(
     ...
      277  
      278          require(bytes(title).length > 0, "Title required");
      279          require(bytes(description).length > 0, "Description re
           quired");
      156 -        uint256 n = milestoneDescriptions.length;             
      280 +        uint256 n = items.length;                             
      281          require(n >= 1, "At least one milestone");
      282          require(n <= MAX_MILESTONES, "Too many milestones");
      159 -        require(milestoneAmounts.length == n, "Milestone lengt
          -h mismatch");                                                 
      283  
      161 -        uint256 totalGoal = 0;                                
      162 -        for (uint256 i = 0; i < n; i++) {                     
      163 -            require(milestoneAmounts[i] > 0, "Milestone amount
          - must be > 0");                                               
      164 -            totalGoal += milestoneAmounts[i];                 
      165 -        }                                                     
      284 +        _validateApprovalConfig(approval);                    
      285  
      286          campaignId = campaignCount++;
      287  
      288 +        uint256 totalGoal = 0;                                
      289          for (uint256 i = 0; i < n; i++) {
      170 -            require(bytes(milestoneDescriptions[i]).length > 0
          -, "Milestone description required");                          
      290 +            MilestoneInput calldata item = items[i];          
      291 +            require(item.amount > 0, "Milestone amount must be
          + > 0");                                                       
      292 +            require(bytes(item.criteria.title).length > 0, "Mi
          +lestone title required");                                     
      293 +            require(                                          
      294 +                bytes(item.criteria.successDefinition).length 
          +> 0,                                                          
      295 +                "Milestone success definition required"       
      296 +            );                                                
      297 +            require(                                          
      298 +                item.criteria.proofDeadline == 0 ||           
      299 +                    item.criteria.proofDeadline > block.timest
          +amp,                                                          
      300 +                "Milestone deadline must be in the future"    
      301 +            );                                                
      302 +            totalGoal += item.amount;                         
      303 +                                                              
      304              _milestones[campaignId].push(
      305                  Milestone({
      173 -                    description: milestoneDescriptions[i],    
      174 -                    amount: milestoneAmounts[i],              
      175 -                    evidence: "",                             
      176 -                    evidenceSubmitted: false,                 
      306 +                    criteria: item.criteria,                  
      307 +                    amount: item.amount,                      
      308 +                    state: MilestoneState.Pending,            
      309 +                    submissionCount: 0,                       
      310 +                    approvalCount: 0,                         
      311                      released: false
      312                  })
      313              );
      314          }
      315  
      316 +        ApprovalConfig storage cfg = _approvals[campaignId];  
      317 +        cfg.model = approval.model;                           
      318 +        cfg.threshold = approval.threshold;                   
      319 +        for (uint256 i = 0; i < approval.reviewers.length; i++
          +) {                                                           
      320 +            cfg.reviewers.push(approval.reviewers[i]);        
      321 +        }                                                     
      322 +                                                              
      323          Campaign storage c = _campaigns[campaignId];
      324          c.id = campaignId;
      325          c.creator = msg.sender;
      326          c.title = title;
      327          c.description = description;
      328 +        c.kind = kind;                                        
      329          c.goalAmount = totalGoal;
      330          c.active = true;
      331          c.createdAt = block.timestamp;
     ...
      335          emit CampaignCreated(campaignId, msg.sender, title, to
           talGoal, n);
      336      }
      337  
      338 +    function _validateApprovalConfig(ApprovalConfig calldata a
          +pproval) private view {                                       
      339 +        if (approval.model == ApprovalModel.DesignatedReviewer
          +s) {                                                          
      340 +            uint256 rn = approval.reviewers.length;           
      341 +            require(rn >= 1, "Reviewers required");           
      342 +            require(rn <= MAX_REVIEWERS, "Too many reviewers")
          +;                                                             
      343 +            require(                                          
      344 +                approval.threshold >= 1 && approval.threshold 
          +<= rn,                                                        
      345 +                "Threshold must be 1..reviewer count"         
      346 +            );                                                
      347 +            for (uint256 i = 0; i < rn; i++) {                
      348 +                address r = approval.reviewers[i];            
      349 +                require(r != address(0), "Reviewer cannot be z
          +ero address");                                                
      350 +                require(r != msg.sender, "Creator cannot revie
          +w own campaign");                                             
      351 +                for (uint256 j = i + 1; j < rn; j++) {        
      352 +                    require(r != approval.reviewers[j], "Dupli
          +cate reviewer");                                              
      353 +                }                                             
      354 +            }                                                 
      355 +        } else if (                                           
      356 +            approval.model == ApprovalModel.LeadDonor ||      
      357 +            approval.model == ApprovalModel.PlatformOperator  
      358 +        ) {                                                   
      359 +            require(approval.reviewers.length == 0, "Reviewers
          + only for designated model");                                 
      360 +            require(approval.threshold == 1, "Threshold must b
          +e 1 for this model");                                         
      361 +        } else {                                              
      362 +            // ApprovalModel.DonorVote — scaffolded for donor-
          +wide voting, which                                            
      363 +            // needs snapshotting + quorum design before it ca
          +n be enabled.                                                 
      364 +            revert("Donor voting not supported yet");         
      365 +        }                                                     
      366 +    }                                                         
      367 +                                                              
      368      /**
      369       * @notice Donate USDC into this campaign's escrow.
      370       * @param amount USDC base units; the donor must have appr
           ove()d at least
     ...
      373      function donate(uint256 campaignId, uint256 amount) extern
           al campaignExists(campaignId) {
      374          Campaign storage c = _campaigns[campaignId];
      375          require(c.active, "Campaign not active");
      376 +        // A campaign past its milestone deadline is headed fo
          +r cancellation;                                               
      377 +        // taking new escrow into it would only grow the refun
          +d pool.                                                       
      378 +        require(!milestoneFailed(campaignId), "Milestone deadl
          +ine passed");                                                 
      379          // Creators can't fund their own campaign: self-donati
           ons would let them
      205 -        // farm trust score for free (donate -> junk evidence 
          --> auto-release                                               
      206 -        // back to themselves) and inflate totalRaised with wa
          -sh donations.                                                 
      380 +        // farm trust score and inflate totalRaised with wash 
          +donations.                                                    
      381          require(msg.sender != c.creator, "Creator cannot donat
           e to own campaign");
      382          require(amount > 0, "Donation must be > 0");
      383          require(c.totalRaised + amount <= c.goalAmount, "Donat
           ion exceeds campaign goal");
     ...
      390          c.totalRaised += amount;
      391          _creatorStats[c.creator].totalRaised += amount;
      392  
      393 +        if (donations[campaignId][msg.sender] > donations[camp
          +aignId][leadDonor[campaignId]]) {                             
      394 +            leadDonor[campaignId] = msg.sender;               
      395 +        }                                                     
      396 +                                                              
      397          usdc.safeTransferFrom(msg.sender, address(this), amoun
           t);
      398  
      399          emit DonationReceived(campaignId, msg.sender, amount, 
           c.totalRaised);
      400      }
      401  
      402      /**
      225 -     * @notice Creator submits proof for the current milestone
          -.                                                             
      226 -     *         Funds are automatically released to the creator
          - upon submission.                                             
      403 +     * @notice Creator submits a proof package for the current
          + milestone.                                                   
      404 +     *         Funds are NOT released here — the campaign's re
          +viewers must                                                  
      405 +     *         approve the package against the milestone's acc
          +eptance criteria.                                             
      406 +     * @param summary Short public summary (keep sensitive det
          +ail off-chain).                                               
      407 +     * @param manifestHash keccak256 of the canonical proof-pa
          +ckage manifest.                                               
      408 +     * @param manifestURI Optional public pointer to the manif
          +est; pass "" to                                               
      409 +     *        keep the package private (reviewers verify it vi
          +a the hash).                                                  
      410       */
      228 -    function submitEvidence(                                  
      411 +    function submitProof(                                     
      412          uint256 campaignId,
      230 -        string calldata evidence                              
      231 -    ) external campaignExists(campaignId) nonReentrant {      
      413 +        string calldata summary,                              
      414 +        bytes32 manifestHash,                                 
      415 +        string calldata manifestURI                           
      416 +    ) external campaignExists(campaignId) {                   
      417          Campaign storage c = _campaigns[campaignId];
      418          require(msg.sender == c.creator, "Only creator");
      234 -        require(bytes(evidence).length > 0, "Evidence required
          -");                                                           
      235 -        require(c.active && !c.completed, "Campaign not active
          -");                                                           
      419 +        require(c.active, "Campaign not active");             
      420 +        require(bytes(summary).length > 0, "Summary required")
          +;                                                             
      421 +        require(manifestHash != bytes32(0), "Manifest hash req
          +uired");                                                      
      422  
      423          uint256 mi = c.currentMilestone;
      424          require(mi < c.milestoneCount, "No active milestone");
      425  
      426          Milestone storage m = _milestones[campaignId][mi];
      241 -        require(!m.released, "Already released");             
      242 -        // Release only what this campaign's own donations cov
          -er — otherwise the                                            
      243 -        // transfer below would be paid out of other campaigns
          -' escrow.                                                     
      427 +        require(                                              
      428 +            m.state == MilestoneState.Pending || m.state == Mi
          +lestoneState.ChangesRequested,                                
      429 +            "Milestone not awaiting proof"                    
      430 +        );                                                    
      431 +        uint64 deadline = m.criteria.proofDeadline;           
      432 +        require(deadline == 0 || block.timestamp <= deadline, 
          +"Proof deadline passed");                                     
      433 +        // The tranche must be funded before review starts; re
          +leasing an                                                    
      434 +        // underfunded milestone would draw from other campaig
          +ns' escrow.                                                   
      435          require(c.totalReleased + m.amount <= c.totalRaised, "
           Milestone not funded");
      436  
      246 -        m.evidence = evidence;                                
      247 -        m.evidenceSubmitted = true;                           
      248 -        _creatorStats[c.creator].evidenceUpdates += 1;        
      437 +        uint256 submissionIndex = _submissions[campaignId][mi]
          +.length;                                                      
      438 +        _submissions[campaignId][mi].push(                    
      439 +            ProofSubmission({                                 
      440 +                manifestHash: manifestHash,                   
      441 +                manifestURI: manifestURI,                     
      442 +                summary: summary,                             
      443 +                submittedAt: uint64(block.timestamp)          
      444 +            })                                                
      445 +        );                                                    
      446 +        m.state = MilestoneState.Submitted;                   
      447 +        m.approvalCount = 0;                                  
      448 +        m.submissionCount += 1;                               
      449 +        _creatorStats[c.creator].proofSubmissions += 1;       
      450  
      250 -        emit EvidenceSubmitted(campaignId, mi, evidence);     
      451 +        emit ProofSubmitted(campaignId, mi, submissionIndex, m
          +anifestHash, summary);                                        
      452 +    }                                                         
      453  
      252 -        // Auto-release: transfer this milestone's funds to th
          -e creator                                                     
      454 +    /**                                                       
      455 +     * @notice An authorized reviewer approves or rejects the 
          +latest proof                                                  
      456 +     *         package for the current milestone. Rejection re
          +quires notes and                                              
      457 +     *         sends the milestone back to the creator for rev
          +ision; approval                                               
      458 +     *         releases funds once the campaign's threshold is
          + met.                                                         
      459 +     */                                                       
      460 +    function reviewProof(                                     
      461 +        uint256 campaignId,                                   
      462 +        bool approve,                                         
      463 +        string calldata notes                                 
      464 +    ) external campaignExists(campaignId) nonReentrant {      
      465 +        Campaign storage c = _campaigns[campaignId];          
      466 +        require(c.active, "Campaign not active");             
      467 +        require(isReviewer(campaignId, msg.sender), "Not an au
          +thorized reviewer");                                          
      468 +        require(msg.sender != c.creator, "Creator cannot revie
          +w own campaign");                                             
      469 +                                                              
      470 +        uint256 mi = c.currentMilestone;                      
      471 +        require(mi < c.milestoneCount, "No active milestone");
      472 +        Milestone storage m = _milestones[campaignId][mi];    
      473 +        require(m.state == MilestoneState.Submitted, "No proof
          + awaiting review");                                           
      474 +                                                              
      475 +        uint256 submissionIndex = _submissions[campaignId][mi]
          +.length - 1;                                                  
      476 +        require(                                              
      477 +            !_reviewed[campaignId][mi][submissionIndex][msg.se
          +nder],                                                        
      478 +            "Already reviewed this submission"                
      479 +        );                                                    
      480 +        _reviewed[campaignId][mi][submissionIndex][msg.sender]
          + = true;                                                      
      481 +                                                              
      482 +        if (!approve) {                                       
      483 +            require(bytes(notes).length > 0, "Rejection notes 
          +required");                                                   
      484 +        }                                                     
      485 +                                                              
      486 +        _reviews[campaignId][mi].push(                        
      487 +            ReviewDecision({                                  
      488 +                reviewer: msg.sender,                         
      489 +                approved: approve,                            
      490 +                notes: notes,                                 
      491 +                decidedAt: uint64(block.timestamp),           
      492 +                submissionIndex: uint32(submissionIndex)      
      493 +            })                                                
      494 +        );                                                    
      495 +                                                              
      496 +        emit ProofReviewed(campaignId, mi, msg.sender, submiss
          +ionIndex, approve, notes);                                    
      497 +                                                              
      498 +        if (!approve) {                                       
      499 +            // One rejection sends the package back for revisi
          +on. Escrow stays                                              
      500 +            // locked; any approvals already cast apply only t
          +o that submission.                                            
      501 +            m.state = MilestoneState.ChangesRequested;        
      502 +            return;                                           
      503 +        }                                                     
      504 +                                                              
      505 +        m.approvalCount += 1;                                 
      506 +        if (m.approvalCount >= _approvals[campaignId].threshol
          +d) {                                                          
      507 +            _releaseMilestone(campaignId, c, m, mi);          
      508 +        }                                                     
      509 +    }                                                         
      510 +                                                              
      511 +    function _releaseMilestone(                               
      512 +        uint256 campaignId,                                   
      513 +        Campaign storage c,                                   
      514 +        Milestone storage m,                                  
      515 +        uint256 mi                                            
      516 +    ) private {                                               
      517 +        m.state = MilestoneState.Approved;                    
      518          m.released = true;
      519          c.totalReleased += m.amount;
      520          c.currentMilestone += 1;
      521  
      522          CreatorStats storage s = _creatorStats[c.creator];
      523          s.totalReleased += m.amount;
      259 -        s.milestonesCompleted += 1;                           
      524 +        s.milestonesApproved += 1;                            
      525  
      526          bool completed = c.currentMilestone >= c.milestoneCoun
           t;
      527          if (completed) {
     ...
      536          if (completed) emit CampaignCompleted(campaignId);
      537      }
      538  
      539 +    /**                                                       
      540 +     * @notice Creator voluntarily cancels their campaign, ope
          +ning refunds for                                              
      541 +     *         all unreleased escrow.                         
      542 +     */                                                       
      543 +    function cancelCampaign(uint256 campaignId) external campa
          +ignExists(campaignId) {                                       
      544 +        Campaign storage c = _campaigns[campaignId];          
      545 +        require(msg.sender == c.creator, "Only creator");     
      546 +        require(c.active, "Campaign not active");             
      547 +        _cancel(campaignId, c, true);                         
      548 +    }                                                         
      549 +                                                              
      550 +    /**                                                       
      551 +     * @notice Anyone can fail a campaign whose current milest
          +one missed its                                                
      552 +     *         proof deadline (plus REVIEW_WINDOW when a submi
          +ssion is stuck in                                             
      553 +     *         review), opening refunds. This is the recovery 
          +path when a                                                   
      554 +     *         creator disappears — or when reviewers do.     
      555 +     */                                                       
      556 +    function failCampaign(uint256 campaignId) external campaig
          +nExists(campaignId) {                                         
      557 +        Campaign storage c = _campaigns[campaignId];          
      558 +        require(c.active, "Campaign not active");             
      559 +        require(milestoneFailed(campaignId), "Deadline has not
          + passed");                                                    
      560 +        _cancel(campaignId, c, false);                        
      561 +    }                                                         
      562 +                                                              
      563 +    function _cancel(uint256 campaignId, Campaign storage c, b
          +ool voluntary) private {                                      
      564 +        c.active = false;                                     
      565 +        c.cancelledAt = uint64(block.timestamp);              
      566 +        emit CampaignCancelled(campaignId, c.currentMilestone,
          + voluntary);                                                  
      567 +    }                                                         
      568 +                                                              
      569 +    /**                                                       
      570 +     * @notice After cancellation, each donor reclaims their p
          +ro-rata share of                                              
      571 +     *         the unreleased escrow: donation * (totalRaised 
          +- totalReleased)                                              
      572 +     *         / totalRaised. Funds already released for appro
          +ved milestones                                                
      573 +     *         are not clawed back.                           
      574 +     */                                                       
      575 +    function claimRefund(uint256 campaignId) external campaign
          +Exists(campaignId) nonReentrant {                             
      576 +        Campaign storage c = _campaigns[campaignId];          
      577 +        require(c.cancelledAt != 0, "Campaign not cancelled");
      578 +                                                              
      579 +        uint256 amount = refundOf(campaignId, msg.sender);    
      580 +        require(amount > 0, "Nothing to refund");             
      581 +                                                              
      582 +        donations[campaignId][msg.sender] = 0;                
      583 +        usdc.safeTransfer(msg.sender, amount);                
      584 +                                                              
      585 +        emit RefundClaimed(campaignId, msg.sender, amount);   
      586 +    }                                                         
      587 +                                                              
      588      // -------------------------------------------------------
           ------------------
      589      // View functions
      590      // -------------------------------------------------------
           ------------------
      591  
      592 +    /// @notice A donor's claimable refund (0 unless the campa
          +ign is cancelled).                                            
      593 +    function refundOf(uint256 campaignId, address donor)      
      594 +        public                                                
      595 +        view                                                  
      596 +        campaignExists(campaignId)                            
      597 +        returns (uint256)                                     
      598 +    {                                                         
      599 +        Campaign storage c = _campaigns[campaignId];          
      600 +        if (c.cancelledAt == 0 || c.totalRaised == 0) return 0
          +;                                                             
      601 +        uint256 unreleased = c.totalRaised - c.totalReleased; 
      602 +        return (donations[campaignId][donor] * unreleased) / c
          +.totalRaised;                                                 
      603 +    }                                                         
      604 +                                                              
      605 +    /**                                                       
      606 +     * @notice True when the current milestone's deadline has 
          +passed without an                                             
      607 +     *         approved release: creator missed the proof dead
          +line, or a                                                    
      608 +     *         submission sat unreviewed past deadline + REVIE
          +W_WINDOW. When                                                
      609 +     *         true, failCampaign() can be called by anyone.  
      610 +     */                                                       
      611 +    function milestoneFailed(uint256 campaignId)              
      612 +        public                                                
      613 +        view                                                  
      614 +        campaignExists(campaignId)                            
      615 +        returns (bool)                                        
      616 +    {                                                         
      617 +        Campaign storage c = _campaigns[campaignId];          
      618 +        if (!c.active) return false;                          
      619 +        uint256 mi = c.currentMilestone;                      
      620 +        if (mi >= c.milestoneCount) return false;             
      621 +        Milestone storage m = _milestones[campaignId][mi];    
      622 +        uint64 deadline = m.criteria.proofDeadline;           
      623 +        if (deadline == 0) return false;                      
      624 +        if (m.state == MilestoneState.Submitted) {            
      625 +            return block.timestamp > uint256(deadline) + REVIE
          +W_WINDOW;                                                     
      626 +        }                                                     
      627 +        // Pending or ChangesRequested: the creator had until 
          +the deadline.                                                 
      628 +        return block.timestamp > deadline;                    
      629 +    }                                                         
      630 +                                                              
      631 +    /// @notice Whether an address currently holds review auth
          +ority for a campaign.                                         
      632 +    function isReviewer(uint256 campaignId, address account)  
      633 +        public                                                
      634 +        view                                                  
      635 +        campaignExists(campaignId)                            
      636 +        returns (bool)                                        
      637 +    {                                                         
      638 +        ApprovalConfig storage cfg = _approvals[campaignId];  
      639 +        if (cfg.model == ApprovalModel.DesignatedReviewers) { 
      640 +            for (uint256 i = 0; i < cfg.reviewers.length; i++)
          + {                                                            
      641 +                if (cfg.reviewers[i] == account) return true; 
      642 +            }                                                 
      643 +            return false;                                     
      644 +        }                                                     
      645 +        if (cfg.model == ApprovalModel.LeadDonor) {           
      646 +            return account != address(0) && account == leadDon
          +or[campaignId];                                               
      647 +        }                                                     
      648 +        if (cfg.model == ApprovalModel.PlatformOperator) {    
      649 +            return account == owner();                        
      650 +        }                                                     
      651 +        return false;                                         
      652 +    }                                                         
      653 +                                                              
      654      function getCampaign(uint256 campaignId)
      655          external
      656          view
     ...
      686          return _milestones[campaignId][index];
      687      }
      688  
      689 +    function getApprovalConfig(uint256 campaignId)            
      690 +        external                                              
      691 +        view                                                  
      692 +        campaignExists(campaignId)                            
      693 +        returns (ApprovalConfig memory)                       
      694 +    {                                                         
      695 +        return _approvals[campaignId];                        
      696 +    }                                                         
      697 +                                                              
      698 +    function getSubmissions(uint256 campaignId, uint256 milest
          +oneIndex)                                                     
      699 +        external                                              
      700 +        view                                                  
      701 +        campaignExists(campaignId)                            
      702 +        returns (ProofSubmission[] memory)                    
      703 +    {                                                         
      704 +        return _submissions[campaignId][milestoneIndex];      
      705 +    }                                                         
      706 +                                                              
      707 +    function getReviews(uint256 campaignId, uint256 milestoneI
          +ndex)                                                         
      708 +        external                                              
      709 +        view                                                  
      710 +        campaignExists(campaignId)                            
      711 +        returns (ReviewDecision[] memory)                     
      712 +    {                                                         
      713 +        return _reviews[campaignId][milestoneIndex];          
      714 +    }                                                         
      715 +                                                              
      716 +    /// @notice Whether a reviewer has already voted on a give
          +n submission.                                                 
      717 +    function hasReviewed(                                     
      718 +        uint256 campaignId,                                   
      719 +        uint256 milestoneIndex,                               
      720 +        uint256 submissionIndex,                              
      721 +        address reviewer                                      
      722 +    ) external view returns (bool) {                          
      723 +        return _reviewed[campaignId][milestoneIndex][submissio
          +nIndex][reviewer];                                            
      724 +    }                                                         
      725 +                                                              
      726      function getDonors(uint256 campaignId) external view retur
           ns (address[] memory) {
      727          return _donors[campaignId];
      728      }
     ...
      735          return _creatorStats[creator];
      736      }
      737  
      738 +    /**                                                       
      739 +     * @notice Reputation out of 100. Only reviewer-verified o
          +utcomes score:                                                
      740 +     *         approved milestones and completed campaigns. Ra
          +w proof                                                       
      741 +     *         submissions deliberately earn nothing.         
      742 +     */                                                       
      743      function trustScore(address creator) public view returns (
           uint256) {
      744          CreatorStats memory s = _creatorStats[creator];
      745          if (s.campaignsCreated == 0) return 0;
      746  
      747          uint256 score = 10;
      330 -        score += s.milestonesCompleted * 12;                  
      748 +        score += s.milestonesApproved * 12;                   
      749          score += s.campaignsCompleted * 15;
      750  
      333 -        uint256 evidencePoints = s.evidenceUpdates * 3;       
      334 -        if (evidencePoints > 15) evidencePoints = 15;         
      335 -        score += evidencePoints;                              
      336 -                                                              
      751          if (score > 100) score = 100;
      752          return score;
      753      }

  Ran 1 shell command (ctrl+o to expand)
⏺ Write(~/Downloads/tracefund/packages/hardhat/test/Covenant.ts)
  ⎿  Added 651 lines, removed 223 lines
       7  // All amounts are USDC base units (6 decimals).
       8  const usdc6 = (v: string) => ethers.parseUnits(v, 6);
       9  
      10 -// Demo campaign milestone amounts (PRD §15). Kept tiny to mirr
         -or the safe demo values.                                       
      11 -const M1 = usdc6("0.02"); // Hospital deposit receipt          
      12 -const M2 = usdc6("0.015"); // Medication purchase receipt      
      13 -const M3 = usdc6("0.015"); // Follow-up appointment confirmatio
         -n                                                              
      10 +// Demo campaign milestone amounts. Kept tiny to mirror the saf
         +e demo values.                                                 
      11 +const M1 = usdc6("0.02");                                      
      12 +const M2 = usdc6("0.015");                                     
      13 +const M3 = usdc6("0.015");                                     
      14  const GOAL = M1 + M2 + M3; // 0.05 USDC
      15  
      16  const TITLE = "Community Medical Relief Fund";
      17  const DESCRIPTION =
      18 -  "A transparent emergency fundraiser where each milestone's fu
         -nds unlock only after the creator posts on-chain proof.";      
      19 -const MILESTONE_DESCRIPTIONS = [                               
      20 -  "Hospital deposit receipt",                                  
      21 -  "Medication purchase receipt",                               
      22 -  "Follow-up appointment confirmation",                        
      23 -];                                                             
      24 -const MILESTONE_AMOUNTS = [M1, M2, M3];                        
      18 +  "A transparent emergency fundraiser where each milestone's fu
         +nds unlock only after reviewers approve the creator's proof."; 
      19  
      20 +// Contract enums (must match Covenant.sol declaration order). 
      21 +const ApprovalModel = {                                        
      22 +  DesignatedReviewers: 0,                                      
      23 +  LeadDonor: 1,                                                
      24 +  PlatformOperator: 2,                                         
      25 +  DonorVote: 3,                                                
      26 +} as const;                                                    
      27 +const MilestoneState = { Pending: 0, Submitted: 1, ChangesReque
         +sted: 2, Approved: 3 } as const;                               
      28 +const CampaignKind = { Charity: 0, Startup: 1, Grant: 2, Other:
         + 3 } as const;                                                 
      29 +                                                               
      30 +const REVIEW_WINDOW = 14 * 24 * 60 * 60;                       
      31 +const DAY = 24 * 60 * 60;                                      
      32 +                                                               
      33  // Plenty of USDC for every donor in every test.
      34  const DONOR_FUNDING = usdc6("1000");
      35  
      36 +const HASH1 = ethers.keccak256(ethers.toUtf8Bytes("proof-manife
         +st-1"));                                                       
      37 +const HASH2 = ethers.keccak256(ethers.toUtf8Bytes("proof-manife
         +st-2"));                                                       
      38 +                                                               
      39 +function criteria(overrides: Partial<Record<string, unknown>> =
         + {}) {                                                         
      40 +  return {                                                     
      41 +    title: "Hospital deposit paid",                            
      42 +    successDefinition: "Deposit receipt from the hospital match
         +ing the milestone amount",                                     
      43 +    reportingPeriod: "Once, within the treatment window",      
      44 +    expectedMetrics: "",                                       
      45 +    requiredProof: "Receipt photo or PDF, hospital reference nu
         +mber",                                                         
      46 +    proofDeadline: 0,                                          
      47 +    ...overrides,                                              
      48 +  };                                                           
      49 +}                                                              
      50 +                                                               
      51 +function milestoneInputs(                                      
      52 +  amounts: bigint[] = [M1, M2, M3],                            
      53 +  perMilestone: Array<Partial<Record<string, unknown>>> = [],  
      54 +) {                                                            
      55 +  return amounts.map((amount, i) => ({                         
      56 +    criteria: criteria({ title: `Milestone ${i + 1} deliverable
         +`, ...(perMilestone[i] ?? {}) }),                              
      57 +    amount,                                                    
      58 +  }));                                                         
      59 +}                                                              
      60 +                                                               
      61  describe("Covenant", function () {
      62    async function deployFixture() {
      31 -    const [creator, donorA, donorB, outsider] = await ethers.ge
         -tSigners();                                                    
      63 +    const [creator, donorA, donorB, outsider, reviewer1, review
         +er2, reviewer3] =                                              
      64 +      await ethers.getSigners();                               
      65  
      66      const TokenFactory = await ethers.getContractFactory("MockU
          SDC");
      67      const usdc = (await TokenFactory.deploy()) as MockUSDC;
     ...
       77        await usdc.connect(donor).approve(await covenant.getAddr
           ess(), DONOR_FUNDING);
       78      }
       79  
       47 -    return { covenant, usdc, creator, donorA, donorB, outsider
          - };                                                           
       80 +    return { covenant, usdc, creator, donorA, donorB, outsider
          +, reviewer1, reviewer2, reviewer3 };                          
       81    }
       82  
       50 -  async function createDemoCampaign(covenant: Covenant, creato
          -r: HardhatEthersSigner) {                                     
       51 -    await covenant                                            
       52 -      .connect(creator)                                       
       53 -      .createCampaign(TITLE, DESCRIPTION, MILESTONE_DESCRIPTIO
          -NS, MILESTONE_AMOUNTS);                                       
       54 -    return 0n; // first campaign id                           
       83 +  /** Create the demo campaign with two designated reviewers, 
          +threshold 1. */                                               
       84 +  async function createDemoCampaign(                          
       85 +    covenant: Covenant,                                       
       86 +    creator: HardhatEthersSigner,                             
       87 +    reviewers: string[],                                      
       88 +    opts: {                                                   
       89 +      threshold?: number;                                     
       90 +      model?: number;                                         
       91 +      items?: ReturnType<typeof milestoneInputs>;             
       92 +      kind?: number;                                          
       93 +    } = {},                                                   
       94 +  ) {                                                         
       95 +    await covenant.connect(creator).createCampaign(           
       96 +      TITLE,                                                  
       97 +      DESCRIPTION,                                            
       98 +      opts.kind ?? CampaignKind.Charity,                      
       99 +      {                                                       
      100 +        model: opts.model ?? ApprovalModel.DesignatedReviewers
          +,                                                             
      101 +        reviewers,                                            
      102 +        threshold: opts.threshold ?? 1,                       
      103 +      },                                                      
      104 +      opts.items ?? milestoneInputs(),                        
      105 +    );                                                        
      106 +    return (await covenant.campaignCount()) - 1n;             
      107    }
      108  
       57 -  // A fixture with a created campaign fully funded into escro
          -w by two donors.                                              
      109 +  // A campaign fully funded into escrow by two donors, review
          +ed by reviewer1/2.                                            
      110    async function fundedFixture() {
      111      const base = await deployFixture();
       60 -    const { covenant, creator, donorA, donorB } = base;       
       61 -    const id = await createDemoCampaign(covenant, creator);   
      112 +    const { covenant, creator, donorA, donorB, reviewer1, revi
          +ewer2 } = base;                                               
      113 +    const id = await createDemoCampaign(covenant, creator, [  
      114 +      reviewer1.address,                                      
      115 +      reviewer2.address,                                      
      116 +    ]);                                                       
      117      await covenant.connect(donorA).donate(id, usdc6("0.01"));
      118      await covenant.connect(donorA).donate(id, usdc6("0.01")); 
           // donorA total 0.02
      119      await covenant.connect(donorB).donate(id, usdc6("0.019"));
     ...
      122      return { ...base, id };
      123    }
      124  
      125 +  // fundedFixture, plus proof already submitted for milestone
          + one.                                                         
      126 +  async function submittedFixture() {                         
      127 +    const base = await fundedFixture();                       
      128 +    await base.covenant                                       
      129 +      .connect(base.creator)                                  
      130 +      .submitProof(base.id, "Deposit paid — receipt in proof p
          +ackage", HASH1, "");                                          
      131 +    return base;                                              
      132 +  }                                                           
      133 +                                                              
      134    describe("Deployment", function () {
      135      it("exposes the expected constants", async function () {
      136        const { covenant, usdc } = await loadFixture(deployFixtu
           re);
      137        expect(await covenant.MAX_MILESTONES()).to.equal(5n);
      138 +      expect(await covenant.MAX_REVIEWERS()).to.equal(7n);    
      139 +      expect(await covenant.REVIEW_WINDOW()).to.equal(BigInt(R
          +EVIEW_WINDOW));                                               
      140        expect(await covenant.campaignCount()).to.equal(0n);
      141        expect(await covenant.usdc()).to.equal(await usdc.getAdd
           ress());
      142      });
     ...
      150    });
      151  
      152    describe("createCampaign", function () {
       87 -    it("creates a campaign and sums milestone amounts into the
          - goal", async function () {                                   
       88 -      const { covenant, creator } = await loadFixture(deployFi
          -xture);                                                       
      153 +    it("stores milestone acceptance criteria and the approval 
          +config", async function () {                                  
      154 +      const { covenant, creator, reviewer1, reviewer2 } = awai
          +t loadFixture(deployFixture);                                 
      155 +      const deadline = (await time.latest()) + 30 * DAY;      
      156  
      157        await expect(
       91 -        covenant                                              
       92 -          .connect(creator)                                   
       93 -          .createCampaign(TITLE, DESCRIPTION, MILESTONE_DESCRI
          -PTIONS, MILESTONE_AMOUNTS),                                   
      158 +        covenant.connect(creator).createCampaign(             
      159 +          TITLE,                                              
      160 +          DESCRIPTION,                                        
      161 +          CampaignKind.Startup,                               
      162 +          { model: ApprovalModel.DesignatedReviewers, reviewer
          +s: [reviewer1.address, reviewer2.address], threshold: 2 },    
      163 +          milestoneInputs([M1, M2, M3], [                     
      164 +            {                                                 
      165 +              successDefinition: "500 weekly active users with
          + 20% retention",                                              
      166 +              reportingPeriod: "Every 2 weeks",               
      167 +              expectedMetrics: "WAU >= 500, W4 retention >= 20
          +%",                                                           
      168 +              requiredProof: "Analytics dashboard screenshots,
          + usage export",                                               
      169 +              proofDeadline: deadline,                        
      170 +            },                                                
      171 +          ]),                                                 
      172 +        ),                                                    
      173        )
      174          .to.emit(covenant, "CampaignCreated")
      175          .withArgs(0n, creator.address, TITLE, GOAL, 3n);
      176  
       98 -      expect(await covenant.campaignCount()).to.equal(1n);    
       99 -                                                              
      177        const c = await covenant.getCampaign(0);
      178        expect(c.creator).to.equal(creator.address);
      102 -      expect(c.title).to.equal(TITLE);                        
      179 +      expect(c.kind).to.equal(CampaignKind.Startup);          
      180        expect(c.goalAmount).to.equal(GOAL);
      104 -      expect(c.totalRaised).to.equal(0n);                     
      181        expect(c.active).to.equal(true);
      182        expect(c.completed).to.equal(false);
      183 +      expect(c.cancelledAt).to.equal(0n);                     
      184        expect(c.currentMilestone).to.equal(0n);
      185        expect(c.milestoneCount).to.equal(3n);
      186  
      187        const milestones = await covenant.getMilestones(0);
      188        expect(milestones.length).to.equal(3);
      112 -      expect(milestones[0].description).to.equal("Hospital dep
          -osit receipt");                                               
      189 +      expect(milestones[0].criteria.successDefinition).to.equa
          +l(                                                            
      190 +        "500 weekly active users with 20% retention",         
      191 +      );                                                      
      192 +      expect(milestones[0].criteria.expectedMetrics).to.equal(
          +"WAU >= 500, W4 retention >= 20%");                           
      193 +      expect(milestones[0].criteria.proofDeadline).to.equal(Bi
          +gInt(deadline));                                              
      194        expect(milestones[0].amount).to.equal(M1);
      195 +      expect(milestones[0].state).to.equal(MilestoneState.Pend
          +ing);                                                         
      196        expect(milestones[0].released).to.equal(false);
      197  
      116 -      // Creator reputation reflects a created campaign.      
      198 +      const cfg = await covenant.getApprovalConfig(0);        
      199 +      expect(cfg.model).to.equal(ApprovalModel.DesignatedRevie
          +wers);                                                        
      200 +      expect(cfg.reviewers).to.deep.equal([reviewer1.address, 
          +reviewer2.address]);                                          
      201 +      expect(cfg.threshold).to.equal(2n);                     
      202 +                                                              
      203        const stats = await covenant.getCreatorStats(creator.add
           ress);
      204        expect(stats.campaignsCreated).to.equal(1n);
      205      });
      206  
      121 -    it("reverts on empty title", async function () {          
      122 -      const { covenant, creator } = await loadFixture(deployFi
          -xture);                                                       
      207 +    it("reverts on empty title, description, milestone list or
          + oversized list", async function () {                         
      208 +      const { covenant, creator, reviewer1 } = await loadFixtu
          +re(deployFixture);                                            
      209 +      const cfg = { model: ApprovalModel.DesignatedReviewers, 
          +reviewers: [reviewer1.address], threshold: 1 };               
      210 +                                                              
      211        await expect(
      124 -        covenant.connect(creator).createCampaign("", DESCRIPTI
          -ON, ["m"], [M1]),                                             
      212 +        covenant.connect(creator).createCampaign("", DESCRIPTI
          +ON, 0, cfg, milestoneInputs([M1])),                           
      213        ).to.be.revertedWith("Title required");
      126 -    });                                                       
      127 -                                                              
      128 -    it("reverts on empty description", async function () {    
      129 -      const { covenant, creator } = await loadFixture(deployFi
          -xture);                                                       
      214        await expect(
      131 -        covenant.connect(creator).createCampaign(TITLE, "", ["
          -m"], [M1]),                                                   
      215 +        covenant.connect(creator).createCampaign(TITLE, "", 0,
          + cfg, milestoneInputs([M1])),                                 
      216        ).to.be.revertedWith("Description required");
      133 -    });                                                       
      134 -                                                              
      135 -    it("reverts when there are no milestones", async function 
          -() {                                                          
      136 -      const { covenant, creator } = await loadFixture(deployFi
          -xture);                                                       
      217        await expect(
      138 -        covenant.connect(creator).createCampaign(TITLE, DESCRI
          -PTION, [], []),                                               
      218 +        covenant.connect(creator).createCampaign(TITLE, DESCRI
          +PTION, 0, cfg, []),                                           
      219        ).to.be.revertedWith("At least one milestone");
      140 -    });                                                       
      141 -                                                              
      142 -    it("reverts with more than five milestones", async functio
          -n () {                                                        
      143 -      const { covenant, creator } = await loadFixture(deployFi
          -xture);                                                       
      144 -      const descs = ["a", "b", "c", "d", "e", "f"];           
      145 -      const amts = [M1, M1, M1, M1, M1, M1];                  
      220        await expect(
      147 -        covenant.connect(creator).createCampaign(TITLE, DESCRI
          -PTION, descs, amts),                                          
      221 +        covenant                                              
      222 +          .connect(creator)                                   
      223 +          .createCampaign(TITLE, DESCRIPTION, 0, cfg, mileston
          +eInputs([M1, M1, M1, M1, M1, M1])),                           
      224        ).to.be.revertedWith("Too many milestones");
      225      });
      226  
      151 -    it("reverts when a milestone amount is zero", async functi
          -on () {                                                       
      152 -      const { covenant, creator } = await loadFixture(deployFi
          -xture);                                                       
      227 +    it("reverts on incomplete milestone criteria", async funct
          +ion () {                                                      
      228 +      const { covenant, creator, reviewer1 } = await loadFixtu
          +re(deployFixture);                                            
      229 +      const cfg = { model: ApprovalModel.DesignatedReviewers, 
          +reviewers: [reviewer1.address], threshold: 1 };               
      230 +                                                              
      231        await expect(
      154 -        covenant.connect(creator).createCampaign(TITLE, DESCRI
          -PTION, ["m"], [0]),                                           
      232 +        covenant                                              
      233 +          .connect(creator)                                   
      234 +          .createCampaign(TITLE, DESCRIPTION, 0, cfg, [{ crite
          +ria: criteria(), amount: 0 }]),                               
      235        ).to.be.revertedWith("Milestone amount must be > 0");
      236 +      await expect(                                           
      237 +        covenant                                              
      238 +          .connect(creator)                                   
      239 +          .createCampaign(TITLE, DESCRIPTION, 0, cfg, [       
      240 +            { criteria: criteria({ title: "" }), amount: M1 },
      241 +          ]),                                                 
      242 +      ).to.be.revertedWith("Milestone title required");       
      243 +      await expect(                                           
      244 +        covenant                                              
      245 +          .connect(creator)                                   
      246 +          .createCampaign(TITLE, DESCRIPTION, 0, cfg, [       
      247 +            { criteria: criteria({ successDefinition: "" }), a
          +mount: M1 },                                                  
      248 +          ]),                                                 
      249 +      ).to.be.revertedWith("Milestone success definition requi
          +red");                                                        
      250 +                                                              
      251 +      const past = (await time.latest()) - 1;                 
      252 +      await expect(                                           
      253 +        covenant                                              
      254 +          .connect(creator)                                   
      255 +          .createCampaign(TITLE, DESCRIPTION, 0, cfg, [       
      256 +            { criteria: criteria({ proofDeadline: past }), amo
          +unt: M1 },                                                    
      257 +          ]),                                                 
      258 +      ).to.be.revertedWith("Milestone deadline must be in the 
          +future");                                                     
      259      });
      260  
      158 -    it("reverts when descriptions and amounts length mismatch"
          -, async function () {                                         
      159 -      const { covenant, creator } = await loadFixture(deployFi
          -xture);                                                       
      261 +    it("validates the approval config", async function () {   
      262 +      const { covenant, creator, reviewer1, reviewer2 } = awai
          +t loadFixture(deployFixture);                                 
      263 +      const items = milestoneInputs([M1]);                    
      264 +      const make = (cfg: { model: number; reviewers: string[];
          + threshold: number }) =>                                      
      265 +        covenant.connect(creator).createCampaign(TITLE, DESCRI
          +PTION, 0, cfg, items);                                        
      266 +                                                              
      267        await expect(
      161 -        covenant.connect(creator).createCampaign(TITLE, DESCRI
          -PTION, ["m"], [M1, M2]),                                      
      162 -      ).to.be.revertedWith("Milestone length mismatch");      
      268 +        make({ model: ApprovalModel.DesignatedReviewers, revie
          +wers: [], threshold: 1 }),                                    
      269 +      ).to.be.revertedWith("Reviewers required");             
      270 +      await expect(                                           
      271 +        make({ model: ApprovalModel.DesignatedReviewers, revie
          +wers: [reviewer1.address], threshold: 0 }),                   
      272 +      ).to.be.revertedWith("Threshold must be 1..reviewer coun
          +t");                                                          
      273 +      await expect(                                           
      274 +        make({ model: ApprovalModel.DesignatedReviewers, revie
          +wers: [reviewer1.address], threshold: 2 }),                   
      275 +      ).to.be.revertedWith("Threshold must be 1..reviewer coun
          +t");                                                          
      276 +      await expect(                                           
      277 +        make({ model: ApprovalModel.DesignatedReviewers, revie
          +wers: [ethers.ZeroAddress], threshold: 1 }),                  
      278 +      ).to.be.revertedWith("Reviewer cannot be zero address");
      279 +      await expect(                                           
      280 +        make({ model: ApprovalModel.DesignatedReviewers, revie
          +wers: [creator.address], threshold: 1 }),                     
      281 +      ).to.be.revertedWith("Creator cannot review own campaign
          +");                                                           
      282 +      await expect(                                           
      283 +        make({                                                
      284 +          model: ApprovalModel.DesignatedReviewers,           
      285 +          reviewers: [reviewer1.address, reviewer1.address],  
      286 +          threshold: 1,                                       
      287 +        }),                                                   
      288 +      ).to.be.revertedWith("Duplicate reviewer");             
      289 +      await expect(                                           
      290 +        make({ model: ApprovalModel.LeadDonor, reviewers: [rev
          +iewer2.address], threshold: 1 }),                             
      291 +      ).to.be.revertedWith("Reviewers only for designated mode
          +l");                                                          
      292 +      await expect(                                           
      293 +        make({ model: ApprovalModel.LeadDonor, reviewers: [], 
          +threshold: 2 }),                                              
      294 +      ).to.be.revertedWith("Threshold must be 1 for this model
          +");                                                           
      295 +      await expect(                                           
      296 +        make({ model: ApprovalModel.DonorVote, reviewers: [], 
          +threshold: 1 }),                                              
      297 +      ).to.be.revertedWith("Donor voting not supported yet"); 
      298      });
      299    });
      300  
      301    describe("Creation limits (anti-spam)", function () {
      167 -    const create = (covenant: Covenant, signer: HardhatEthersS
          -igner) =>                                                     
      168 -      covenant.connect(signer).createCampaign(TITLE, DESCRIPTI
          -ON, ["m"], [M1]);                                             
      302 +    const create = (covenant: Covenant, signer: HardhatEthersS
          +igner, reviewer: string) =>                                   
      303 +      covenant.connect(signer).createCampaign(                
      304 +        TITLE,                                                
      305 +        DESCRIPTION,                                          
      306 +        CampaignKind.Charity,                                 
      307 +        { model: ApprovalModel.DesignatedReviewers, reviewers:
          + [reviewer], threshold: 1 },                                  
      308 +        milestoneInputs([M1]),                                
      309 +      );                                                      
      310  
      311      it("enforces a 24h cooldown between campaigns for unapprov
           ed creators", async function () {
      171 -      const { covenant, creator } = await loadFixture(deployFi
          -xture);                                                       
      172 -      await create(covenant, creator);                        
      173 -      await expect(create(covenant, creator)).to.be.revertedWi
          -th(                                                           
      312 +      const { covenant, creator, reviewer1 } = await loadFixtu
          +re(deployFixture);                                            
      313 +      await create(covenant, creator, reviewer1.address);     
      314 +      await expect(create(covenant, creator, reviewer1.address
          +)).to.be.revertedWith(                                        
      315          "One campaign per day - try again later",
      316        );
      176 -      await time.increase(24 * 60 * 60);                      
      177 -      await expect(create(covenant, creator)).to.emit(covenant
          -, "CampaignCreated");                                         
      317 +      await time.increase(DAY);                               
      318 +      await expect(create(covenant, creator, reviewer1.address
          +)).to.emit(                                                   
      319 +        covenant,                                             
      320 +        "CampaignCreated",                                    
      321 +      );                                                      
      322      });
      323  
      324      it("caps unapproved creators at FREE_CAMPAIGNS lifetime ca
           mpaigns", async function () {
      181 -      const { covenant, creator } = await loadFixture(deployFi
          -xture);                                                       
      182 -      await create(covenant, creator);                        
      183 -      await time.increase(24 * 60 * 60);                      
      184 -      await create(covenant, creator);                        
      185 -      await time.increase(24 * 60 * 60);                      
      186 -      // Third campaign is blocked even after the cooldown has
          - passed.                                                      
      187 -      await expect(create(covenant, creator)).to.be.revertedWi
          -th(                                                           
      325 +      const { covenant, creator, reviewer1 } = await loadFixtu
          +re(deployFixture);                                            
      326 +      await create(covenant, creator, reviewer1.address);     
      327 +      await time.increase(DAY);                               
      328 +      await create(covenant, creator, reviewer1.address);     
      329 +      await time.increase(DAY);                               
      330 +      await expect(create(covenant, creator, reviewer1.address
          +)).to.be.revertedWith(                                        
      331          "Campaign limit reached - request creator approval",
      332        );
      333      });
      334  
      335      it("owner approval lifts both the cap and the cooldown", a
           sync function () {
      193 -      const { covenant, creator, outsider } = await loadFixtur
          -e(deployFixture);                                             
      194 -      // deployFixture deploys with the default signer (creato
          -r) as owner.                                                  
      336 +      const { covenant, creator, outsider, reviewer1 } = await
          + loadFixture(deployFixture);                                  
      337        await expect(covenant.connect(creator).setCreatorApprova
           l(outsider.address, true))
      338          .to.emit(covenant, "CreatorApprovalChanged")
      339          .withArgs(outsider.address, true);
      340  
      341        for (let i = 0; i < 4; i++) {
      200 -        await expect(create(covenant, outsider)).to.emit(coven
          -ant, "CampaignCreated");                                      
      342 +        await expect(create(covenant, outsider, reviewer1.addr
          +ess)).to.emit(                                                
      343 +          covenant,                                           
      344 +          "CampaignCreated",                                  
      345 +        );                                                    
      346        }
      347      });
      348  
     ...
      358      const DA = usdc6("0.01");
      359      const DB = usdc6("0.015");
      360  
      216 -    it("accepts donations, tracks donor and raised totals, and
          - locks USDC in escrow", async function () {                   
      217 -      const { covenant, usdc, creator, donorA, donorB } = awai
          -t loadFixture(deployFixture);                                 
      218 -      const id = await createDemoCampaign(covenant, creator); 
      361 +    it("accepts donations, tracks donors and the lead donor, a
          +nd locks USDC in escrow", async function () {                 
      362 +      const { covenant, usdc, creator, donorA, donorB, reviewe
          +r1 } =                                                        
      363 +        await loadFixture(deployFixture);                     
      364 +      const id = await createDemoCampaign(covenant, creator, [
          +reviewer1.address]);                                          
      365  
      366        await expect(covenant.connect(donorA).donate(id, DA))
      367          .to.emit(covenant, "DonationReceived")
     ...
      369  
      370        // USDC is held by the contract (escrow), not forwarded 
           to the creator.
      371        expect(await usdc.balanceOf(await covenant.getAddress())
           ).to.equal(DA);
      372 +      expect(await covenant.leadDonor(id)).to.equal(donorA.add
          +ress);                                                        
      373  
      374        await covenant.connect(donorB).donate(id, DB);
      375 +      expect(await covenant.leadDonor(id)).to.equal(donorB.add
          +ress); // outdonated A                                        
      376  
      377        const c = await covenant.getCampaign(id);
      378        expect(c.totalRaised).to.equal(DA + DB);
      379        expect(c.donorCount).to.equal(2n);
      232 -                                                              
      380        expect(await covenant.getDonation(id, donorA.address)).t
           o.equal(DA);
      234 -      const donors = await covenant.getDonors(id);            
      235 -      expect(donors).to.deep.equal([donorA.address, donorB.add
          -ress]);                                                       
      381 +      expect(await covenant.getDonors(id)).to.deep.equal([dono
          +rA.address, donorB.address]);                                 
      382      });
      383  
      238 -    it("accumulates repeated donations from the same donor wit
          -hout double-counting donors", async function () {             
      239 -      const { covenant, creator, donorA } = await loadFixture(
          -deployFixture);                                               
      240 -      const id = await createDemoCampaign(covenant, creator); 
      384 +    it("accumulates repeated donations without double-counting
          + donors", async function () {                                 
      385 +      const { covenant, creator, donorA, reviewer1 } = await l
          +oadFixture(deployFixture);                                    
      386 +      const id = await createDemoCampaign(covenant, creator, [
          +reviewer1.address]);                                          
      387  
      388        await covenant.connect(donorA).donate(id, DA);
      389        await covenant.connect(donorA).donate(id, DB);
     ...
      393        expect(await covenant.getDonation(id, donorA.address)).t
           o.equal(DA + DB);
      394      });
      395  
      250 -    it("reverts on a zero-value donation", async function () {
      251 -      const { covenant, creator, donorA } = await loadFixture(
          -deployFixture);                                               
      252 -      const id = await createDemoCampaign(covenant, creator); 
      396 +    it("reverts on zero donations, self-donations, over-goal d
          +onations and unknown campaigns", async function () {          
      397 +      const { covenant, usdc, creator, donorA, donorB, reviewe
          +r1 } =                                                        
      398 +        await loadFixture(deployFixture);                     
      399 +      const id = await createDemoCampaign(covenant, creator, [
          +reviewer1.address]);                                          
      400 +                                                              
      401        await expect(covenant.connect(donorA).donate(id, 0)).to.
           be.revertedWith(
      402          "Donation must be > 0",
      403        );
      256 -    });                                                       
      404  
      258 -    it("reverts when the creator donates to their own campaign
          -", async function () {                                        
      259 -      const { covenant, usdc, creator } = await loadFixture(de
          -ployFixture);                                                 
      260 -      const id = await createDemoCampaign(covenant, creator); 
      261 -                                                              
      262 -      // Even a fully funded and approved creator wallet must 
          -be rejected —                                                 
      263 -      // self-donations would let creators farm trust score fo
          -r free.                                                       
      405        await usdc.mint(creator.address, DONOR_FUNDING);
      406        await usdc.connect(creator).approve(await covenant.getAd
           dress(), DONOR_FUNDING);
      266 -                                                              
      407        await expect(covenant.connect(creator).donate(id, DA)).t
           o.be.revertedWith(
      408          "Creator cannot donate to own campaign",
      409        );
      410 +                                                              
      411 +      await covenant.connect(donorA).donate(id, usdc6("0.02"))
          +;                                                             
      412 +      await covenant.connect(donorB).donate(id, usdc6("0.03"))
          +;                                                             
      413 +      await expect(covenant.connect(donorB).donate(id, usdc6("
          +0.0001"))).to.be.revertedWith(                                
      414 +        "Donation exceeds campaign goal",                     
      415 +      );                                                      
      416 +                                                              
      417 +      await expect(covenant.connect(donorA).donate(99, M1)).to
          +.be.revertedWith(                                             
      418 +        "Campaign does not exist",                            
      419 +      );                                                      
      420      });
      421  
      422      it("reverts when the donor has not approved enough USDC", 
           async function () {
      273 -      const { covenant, usdc, creator, donorA } = await loadFi
          -xture(deployFixture);                                         
      274 -      const id = await createDemoCampaign(covenant, creator); 
      423 +      const { covenant, usdc, creator, donorA, reviewer1 } = a
          +wait loadFixture(deployFixture);                              
      424 +      const id = await createDemoCampaign(covenant, creator, [
          +reviewer1.address]);                                          
      425  
      426        await usdc.connect(donorA).approve(await covenant.getAdd
           ress(), 0);
      427        await expect(covenant.connect(donorA).donate(id, DA)).to
           .be.revertedWithCustomError(
     ...
      430        );
      431      });
      432  
      283 -    it("allows reaching exactly the goal but reverts a donatio
          -n that would exceed it", async function () {                  
      284 -      const { covenant, creator, donorA, donorB } = await load
          -Fixture(deployFixture);                                       
      285 -      const id = await createDemoCampaign(covenant, creator); 
      433 +    it("stops accepting donations once the current milestone's
          + deadline has passed", async function () {                    
      434 +      const { covenant, creator, donorA, reviewer1 } = await l
          +oadFixture(deployFixture);                                    
      435 +      const deadline = (await time.latest()) + 10 * DAY;      
      436 +      const id = await createDemoCampaign(covenant, creator, [
          +reviewer1.address], {                                         
      437 +        items: milestoneInputs([M1], [{ proofDeadline: deadlin
          +e }]),                                                        
      438 +      });                                                     
      439  
      287 -      await covenant.connect(donorA).donate(id, usdc6("0.02"))
          -;                                                             
      288 -      await covenant.connect(donorB).donate(id, usdc6("0.03"))
          -;                                                             
      440 +      await covenant.connect(donorA).donate(id, usdc6("0.01"))
          +;                                                             
      441 +      await time.increaseTo(deadline + 1);                    
      442 +      await expect(covenant.connect(donorA).donate(id, usdc6("
          +0.01"))).to.be.revertedWith(                                  
      443 +        "Milestone deadline passed",                          
      444 +      );                                                      
      445 +    });                                                       
      446 +  });                                                         
      447  
      290 -      const c = await covenant.getCampaign(id);               
      291 -      expect(c.totalRaised).to.equal(GOAL);                   
      448 +  describe("submitProof", function () {                       
      449 +    it("records the proof package WITHOUT releasing any funds"
          +, async function () {                                         
      450 +      const { covenant, usdc, creator, id } = await loadFixtur
          +e(fundedFixture);                                             
      451  
      293 -      // Any further donation pushes total above the goal and 
          -must revert.                                                  
      452        await expect(
      295 -        covenant.connect(donorB).donate(id, usdc6("0.0001")), 
      296 -      ).to.be.revertedWith("Donation exceeds campaign goal"); 
      453 +        covenant                                              
      454 +          .connect(creator)                                   
      455 +          .submitProof(id, "Deposit paid — receipts in package
          +", HASH1, "data:app/json;base64,xyz"),                        
      456 +      )                                                       
      457 +        .to.emit(covenant, "ProofSubmitted")                  
      458 +        .withArgs(id, 0n, 0n, HASH1, "Deposit paid — receipts 
          +in package");                                                 
      459 +                                                              
      460 +      // Escrow untouched; nothing released; milestone not adv
          +anced.                                                        
      461 +      expect(await usdc.balanceOf(await covenant.getAddress())
          +).to.equal(GOAL);                                             
      462 +      const c = await covenant.getCampaign(id);               
      463 +      expect(c.totalReleased).to.equal(0n);                   
      464 +      expect(c.currentMilestone).to.equal(0n);                
      465 +                                                              
      466 +      const m = await covenant.getMilestone(id, 0);           
      467 +      expect(m.state).to.equal(MilestoneState.Submitted);     
      468 +      expect(m.submissionCount).to.equal(1n);                 
      469 +      expect(m.released).to.equal(false);                     
      470 +                                                              
      471 +      const subs = await covenant.getSubmissions(id, 0);      
      472 +      expect(subs.length).to.equal(1);                        
      473 +      expect(subs[0].manifestHash).to.equal(HASH1);           
      474 +      expect(subs[0].manifestURI).to.equal("data:app/json;base
          +64,xyz");                                                     
      475 +      expect(subs[0].summary).to.equal("Deposit paid — receipt
          +s in package");                                               
      476      });
      477  
      299 -    it("reverts when the campaign does not exist", async funct
          -ion () {                                                      
      300 -      const { covenant, donorA } = await loadFixture(deployFix
          -ture);                                                        
      301 -      await expect(covenant.connect(donorA).donate(99, M1)).to
          -.be.revertedWith(                                             
      302 -        "Campaign does not exist",                            
      478 +    it("requires the milestone tranche to be funded first", as
          +ync function () {                                             
      479 +      const { covenant, creator, donorA, reviewer1 } = await l
          +oadFixture(deployFixture);                                    
      480 +      const id = await createDemoCampaign(covenant, creator, [
          +reviewer1.address]);                                          
      481 +                                                              
      482 +      await expect(                                           
      483 +        covenant.connect(creator).submitProof(id, "s", HASH1, 
          +""),                                                          
      484 +      ).to.be.revertedWith("Milestone not funded");           
      485 +                                                              
      486 +      await covenant.connect(donorA).donate(id, usdc6("0.01"))
          +;                                                             
      487 +      await expect(                                           
      488 +        covenant.connect(creator).submitProof(id, "s", HASH1, 
          +""),                                                          
      489 +      ).to.be.revertedWith("Milestone not funded");           
      490 +                                                              
      491 +      await covenant.connect(donorA).donate(id, usdc6("0.01"))
          +;                                                             
      492 +      await expect(covenant.connect(creator).submitProof(id, "
          +s", HASH1, "")).to.emit(                                      
      493 +        covenant,                                             
      494 +        "ProofSubmitted",                                     
      495        );
      496      });
      497  
      306 -    it("reverts once the campaign is completed (no longer acti
          -ve)", async function () {                                     
      498 +    it("validates sender, summary, hash, deadline and state", 
          +async function () {                                           
      499        const { covenant, creator, donorA, id } = await loadFixt
           ure(fundedFixture);
      308 -      for (let i = 0; i < 3; i++) {                           
      309 -        await covenant.connect(creator).submitEvidence(id, `ip
          -fs://receipt-${i + 1}`);                                      
      310 -      }                                                       
      311 -      await expect(covenant.connect(donorA).donate(id, DA)).to
          -.be.revertedWith(                                             
      312 -        "Campaign not active",                                
      313 -      );                                                      
      500 +                                                              
      501 +      await expect(                                           
      502 +        covenant.connect(donorA).submitProof(id, "s", HASH1, "
          +"),                                                           
      503 +      ).to.be.revertedWith("Only creator");                   
      504 +      await expect(                                           
      505 +        covenant.connect(creator).submitProof(id, "", HASH1, "
          +"),                                                           
      506 +      ).to.be.revertedWith("Summary required");               
      507 +      await expect(                                           
      508 +        covenant.connect(creator).submitProof(id, "s", ethers.
          +ZeroHash, ""),                                                
      509 +      ).to.be.revertedWith("Manifest hash required");         
      510 +                                                              
      511 +      // Double-submit while a package is already under review
          +.                                                             
      512 +      await covenant.connect(creator).submitProof(id, "s", HAS
          +H1, "");                                                      
      513 +      await expect(                                           
      514 +        covenant.connect(creator).submitProof(id, "again", HAS
          +H2, ""),                                                      
      515 +      ).to.be.revertedWith("Milestone not awaiting proof");   
      516      });
      517 +                                                              
      518 +    it("rejects submissions after the proof deadline", async f
          +unction () {                                                  
      519 +      const { covenant, creator, donorA, reviewer1 } = await l
          +oadFixture(deployFixture);                                    
      520 +      const deadline = (await time.latest()) + 10 * DAY;      
      521 +      const id = await createDemoCampaign(covenant, creator, [
          +reviewer1.address], {                                         
      522 +        items: milestoneInputs([M1], [{ proofDeadline: deadlin
          +e }]),                                                        
      523 +      });                                                     
      524 +      await covenant.connect(donorA).donate(id, M1);          
      525 +                                                              
      526 +      await time.increaseTo(deadline + 1);                    
      527 +      await expect(                                           
      528 +        covenant.connect(creator).submitProof(id, "late", HASH
          +1, ""),                                                       
      529 +      ).to.be.revertedWith("Proof deadline passed");          
      530 +    });                                                       
      531    });
      532  
      317 -  describe("submitEvidence (auto-release)", function () {     
      318 -    it("records evidence and releases exactly the milestone am
          -ount to the creator", async function () {                     
      319 -      const { covenant, usdc, creator, id } = await loadFixtur
          -e(fundedFixture);                                             
      533 +  describe("reviewProof", function () {                       
      534 +    it("rejects reviews from anyone without review authority",
          + async function () {                                          
      535 +      const { covenant, outsider, donorA, id } = await loadFix
          +ture(submittedFixture);                                       
      536 +      await expect(                                           
      537 +        covenant.connect(outsider).reviewProof(id, true, ""), 
      538 +      ).to.be.revertedWith("Not an authorized reviewer");     
      539 +      await expect(                                           
      540 +        covenant.connect(donorA).reviewProof(id, true, ""),   
      541 +      ).to.be.revertedWith("Not an authorized reviewer");     
      542 +    });                                                       
      543  
      321 -      const tx = covenant.connect(creator).submitEvidence(id, 
          -"ipfs://receipt-1");                                          
      544 +    it("releases exactly the milestone amount once the thresho
          +ld is met", async function () {                               
      545 +      const { covenant, usdc, creator, reviewer1, id } = await
          + loadFixture(submittedFixture);                               
      546 +                                                              
      547 +      const tx = covenant.connect(reviewer1).reviewProof(id, t
          +rue, "Receipt checks out");                                   
      548        await expect(tx)
      323 -        .to.emit(covenant, "EvidenceSubmitted")               
      324 -        .withArgs(id, 0n, "ipfs://receipt-1")                 
      549 +        .to.emit(covenant, "ProofReviewed")                   
      550 +        .withArgs(id, 0n, reviewer1.address, 0n, true, "Receip
          +t checks out")                                                
      551          .and.to.emit(covenant, "MilestoneReleased")
      552          .withArgs(id, 0n, M1, creator.address);
      553        await expect(tx).to.changeTokenBalances(usdc, [creator, 
           covenant], [M1, -M1]);
      554  
      555        const m = await covenant.getMilestone(id, 0);
      330 -      expect(m.evidenceSubmitted).to.equal(true);             
      331 -      expect(m.evidence).to.equal("ipfs://receipt-1");        
      556 +      expect(m.state).to.equal(MilestoneState.Approved);      
      557        expect(m.released).to.equal(true);
      558  
      559        const c = await covenant.getCampaign(id);
      560        expect(c.totalReleased).to.equal(M1);
      336 -      expect(c.currentMilestone).to.equal(1n); // advanced to 
          -the next milestone                                            
      561 +      expect(c.currentMilestone).to.equal(1n);                
      562        expect(c.completed).to.equal(false);
      563  
      339 -      // Remaining funds stay locked for future milestones.   
      340 -      expect(await usdc.balanceOf(await covenant.getAddress())
          -).to.equal(GOAL - M1);                                        
      341 -                                                              
      564        const stats = await covenant.getCreatorStats(creator.add
           ress);
      343 -      expect(stats.evidenceUpdates).to.equal(1n);             
      344 -      expect(stats.milestonesCompleted).to.equal(1n);         
      565 +      expect(stats.milestonesApproved).to.equal(1n);          
      566        expect(stats.totalReleased).to.equal(M1);
      567      });
      568  
      348 -    it("reverts when the milestone is not yet funded", async f
          -unction () {                                                  
      349 -      const { covenant, creator, donorA } = await loadFixture(
          -deployFixture);                                               
      350 -      const id = await createDemoCampaign(covenant, creator); 
      569 +    it("holds funds until a committee reaches its threshold", 
          +async function () {                                           
      570 +      const { covenant, usdc, creator, donorA, reviewer1, revi
          +ewer2, reviewer3 } =                                          
      571 +        await loadFixture(deployFixture);                     
      572 +      const id = await createDemoCampaign(                    
      573 +        covenant,                                             
      574 +        creator,                                              
      575 +        [reviewer1.address, reviewer2.address, reviewer3.addre
          +ss],                                                          
      576 +        { threshold: 2, items: milestoneInputs([M1]) },       
      577 +      );                                                      
      578 +      await covenant.connect(donorA).donate(id, M1);          
      579 +      await covenant.connect(creator).submitProof(id, "s", HAS
          +H1, "");                                                      
      580  
      352 -      // Nothing donated at all.                              
      353 -      await expect(                                           
      354 -        covenant.connect(creator).submitEvidence(id, "ipfs://r
          -eceipt-1"),                                                   
      355 -      ).to.be.revertedWith("Milestone not funded");           
      581 +      // First approval: below threshold, nothing moves.      
      582 +      await covenant.connect(reviewer1).reviewProof(id, true, 
          +"");                                                          
      583 +      expect(await usdc.balanceOf(await covenant.getAddress())
          +).to.equal(M1);                                               
      584 +      let m = await covenant.getMilestone(id, 0);             
      585 +      expect(m.state).to.equal(MilestoneState.Submitted);     
      586 +      expect(m.approvalCount).to.equal(1n);                   
      587  
      357 -      // Partially funded (below M1 = 0.02) is still not enoug
          -h.                                                            
      358 -      await covenant.connect(donorA).donate(id, usdc6("0.01"))
          -;                                                             
      588 +      // A reviewer cannot vote twice on the same submission. 
      589        await expect(
      360 -        covenant.connect(creator).submitEvidence(id, "ipfs://r
          -eceipt-1"),                                                   
      361 -      ).to.be.revertedWith("Milestone not funded");           
      590 +        covenant.connect(reviewer1).reviewProof(id, true, ""),
      591 +      ).to.be.revertedWith("Already reviewed this submission")
          +;                                                             
      592  
      363 -      // Topping up to cover milestone one unlocks the release
          -.                                                             
      364 -      await covenant.connect(donorA).donate(id, usdc6("0.01"))
          -;                                                             
      365 -      await expect(covenant.connect(creator).submitEvidence(id
          -, "ipfs://receipt-1"))                                        
      593 +      // Second approval crosses the threshold and releases.  
      594 +      await expect(covenant.connect(reviewer2).reviewProof(id,
          + true, ""))                                                   
      595          .to.emit(covenant, "MilestoneReleased")
      596          .withArgs(id, 0n, M1, creator.address);
      597 +      expect(await usdc.balanceOf(await covenant.getAddress())
          +).to.equal(0n);                                               
      598      });
      599  
      370 -    it("cannot pay one campaign's milestone out of another cam
          -paign's escrow", async function () {                          
      371 -      const { covenant, usdc, creator, donorA, outsider } = aw
          -ait loadFixture(deployFixture);                               
      600 +    it("requires notes on rejection and keeps escrow locked", 
          +async function () {                                           
      601 +      const { covenant, usdc, reviewer1, id } = await loadFixt
          +ure(submittedFixture);                                        
      602  
      373 -      // Campaign 0 holds real donations in escrow.           
      374 -      const funded = await createDemoCampaign(covenant, creato
          -r);                                                           
      375 -      await covenant.connect(donorA).donate(funded, usdc6("0.0
          -2"));                                                         
      603 +      await expect(                                           
      604 +        covenant.connect(reviewer1).reviewProof(id, false, "")
          +,                                                             
      605 +      ).to.be.revertedWith("Rejection notes required");       
      606  
      377 -      // The attacker creates their own campaign with zero don
          -ations and tries                                              
      378 -      // to cash out its first milestone from the shared contr
          -act balance.                                                  
      379 -      await covenant                                          
      380 -        .connect(outsider)                                    
      381 -        .createCampaign("Attack", "drain", ["m"], [usdc6("0.02
          -")]);                                                         
      607        await expect(
      383 -        covenant.connect(outsider).submitEvidence(1, "fake pro
          -of"),                                                         
      384 -      ).to.be.revertedWith("Milestone not funded");           
      608 +        covenant                                              
      609 +          .connect(reviewer1)                                 
      610 +          .reviewProof(id, false, "Receipt does not show the h
          +ospital name — please re-scan"),                              
      611 +      )                                                       
      612 +        .to.emit(covenant, "ProofReviewed")                   
      613 +        .withArgs(                                            
      614 +          id,                                                 
      615 +          0n,                                                 
      616 +          reviewer1.address,                                  
      617 +          0n,                                                 
      618 +          false,                                              
      619 +          "Receipt does not show the hospital name — please re
          +-scan",                                                       
      620 +        );                                                    
      621  
      386 -      // Campaign 0's escrow is untouched.                    
      387 -      expect(await usdc.balanceOf(await covenant.getAddress())
          -).to.equal(usdc6("0.02"));                                    
      622 +      // Nothing released; milestone back with the creator.   
      623 +      expect(await usdc.balanceOf(await covenant.getAddress())
          +).to.equal(GOAL);                                             
      624 +      const m = await covenant.getMilestone(id, 0);           
      625 +      expect(m.state).to.equal(MilestoneState.ChangesRequested
          +);                                                            
      626 +      expect(m.released).to.equal(false);                     
      627 +                                                              
      628 +      const reviews = await covenant.getReviews(id, 0);       
      629 +      expect(reviews.length).to.equal(1);                     
      630 +      expect(reviews[0].approved).to.equal(false);            
      631 +      expect(reviews[0].notes).to.contain("hospital name");   
      632      });
      633  
      390 -    it("gates each subsequent milestone on cumulative funding"
          -, async function () {                                         
      391 -      const { covenant, creator, donorA } = await loadFixture(
          -deployFixture);                                               
      392 -      const id = await createDemoCampaign(covenant, creator); 
      634 +    it("lets the creator revise and resubmit after rejection, 
          +resetting approvals", async function () {                     
      635 +      const { covenant, creator, reviewer1, reviewer2, id } = 
      636 +        await loadFixture(submittedFixture);                  
      637  
      394 -      // Fund only milestone one (0.02) and release it.       
      395 -      await covenant.connect(donorA).donate(id, M1);          
      396 -      await covenant.connect(creator).submitEvidence(id, "ipfs
          -://receipt-1");                                               
      638 +      await covenant.connect(reviewer1).reviewProof(id, false,
          + "Wrong document");                                           
      639  
      398 -      // Milestone two (0.015) has no backing donations yet.  
      640 +      // No review possible while the creator is revising.    
      641        await expect(
      400 -        covenant.connect(creator).submitEvidence(id, "ipfs://r
          -eceipt-2"),                                                   
      401 -      ).to.be.revertedWith("Milestone not funded");           
      642 +        covenant.connect(reviewer2).reviewProof(id, true, ""),
      643 +      ).to.be.revertedWith("No proof awaiting review");       
      644  
      403 -      await covenant.connect(donorA).donate(id, M2);          
      404 -      await expect(covenant.connect(creator).submitEvidence(id
          -, "ipfs://receipt-2"))                                        
      405 -        .to.emit(covenant, "MilestoneReleased")               
      406 -        .withArgs(id, 1n, M2, creator.address);               
      645 +      // Resubmission opens a fresh review round; the same rev
          +iewer votes again.                                            
      646 +      await covenant.connect(creator).submitProof(id, "Fixed —
          + correct receipt", HASH2, "");                                
      647 +      const m = await covenant.getMilestone(id, 0);           
      648 +      expect(m.state).to.equal(MilestoneState.Submitted);     
      649 +      expect(m.submissionCount).to.equal(2n);                 
      650 +      expect(m.approvalCount).to.equal(0n);                   
      651 +                                                              
      652 +      await expect(covenant.connect(reviewer1).reviewProof(id,
          + true, "Looks right now"))                                    
      653 +        .to.emit(covenant, "MilestoneReleased");              
      654      });
      655  
      409 -    it("reverts when a non-creator submits evidence", async fu
          -nction () {                                                   
      410 -      const { covenant, donorA, id } = await loadFixture(funde
          -dFixture);                                                    
      411 -      await expect(                                           
      412 -        covenant.connect(donorA).submitEvidence(id, "ipfs://ha
          -ck"),                                                         
      413 -      ).to.be.revertedWith("Only creator");                   
      656 +    it("supports the lead-donor approval model, tracking the c
          +urrent lead", async function () {                             
      657 +      const { covenant, creator, donorA, donorB } = await load
          +Fixture(deployFixture);                                       
      658 +      const id = await createDemoCampaign(covenant, creator, [
          +], {                                                          
      659 +        model: ApprovalModel.LeadDonor,                       
      660 +        items: milestoneInputs([M1, M2]),                     
      661 +      });                                                     
      662 +                                                              
      663 +      await covenant.connect(donorA).donate(id, usdc6("0.01"))
          +;                                                             
      664 +      await covenant.connect(donorB).donate(id, usdc6("0.025")
          +); // donorB is lead                                          
      665 +                                                              
      666 +      await covenant.connect(creator).submitProof(id, "s", HAS
          +H1, "");                                                      
      667 +                                                              
      668 +      expect(await covenant.isReviewer(id, donorB.address)).to
          +.equal(true);                                                 
      669 +      expect(await covenant.isReviewer(id, donorA.address)).to
          +.equal(false);                                                
      670 +      await expect(covenant.connect(donorA).reviewProof(id, tr
          +ue, "")).to.be.revertedWith(                                  
      671 +        "Not an authorized reviewer",                         
      672 +      );                                                      
      673 +      await expect(covenant.connect(donorB).reviewProof(id, tr
          +ue, "")).to.emit(                                             
      674 +        covenant,                                             
      675 +        "MilestoneReleased",                                  
      676 +      );                                                      
      677      });
      678  
      416 -    it("reverts on empty evidence", async function () {       
      417 -      const { covenant, creator, id } = await loadFixture(fund
          -edFixture);                                                   
      418 -      await expect(                                           
      419 -        covenant.connect(creator).submitEvidence(id, ""),     
      420 -      ).to.be.revertedWith("Evidence required");              
      679 +    it("supports the platform-operator approval model", async 
          +function () {                                                 
      680 +      const { covenant, creator, outsider, donorA } = await lo
          +adFixture(deployFixture);                                     
      681 +      // `creator` (signers[0]) is the contract owner, so the 
          +campaign must                                                 
      682 +      // belong to someone else — owners can't review their ow
          +n campaigns.                                                  
      683 +      const id = await createDemoCampaign(covenant, outsider, 
          +[], {                                                         
      684 +        model: ApprovalModel.PlatformOperator,                
      685 +        items: milestoneInputs([M1]),                         
      686 +      });                                                     
      687 +      await covenant.connect(donorA).donate(id, M1);          
      688 +      await covenant.connect(outsider).submitProof(id, "s", HA
          +SH1, "");                                                     
      689 +                                                              
      690 +      await expect(covenant.connect(donorA).reviewProof(id, tr
          +ue, "")).to.be.revertedWith(                                  
      691 +        "Not an authorized reviewer",                         
      692 +      );                                                      
      693 +      await expect(covenant.connect(creator).reviewProof(id, t
          +rue, "")).to.emit(                                            
      694 +        covenant,                                             
      695 +        "MilestoneReleased",                                  
      696 +      );                                                      
      697      });
      698  
      423 -    it("reverts once the campaign is already completed", async
          - function () {                                                
      424 -      const { covenant, creator, id } = await loadFixture(fund
          -edFixture);                                                   
      425 -      for (let i = 0; i < 3; i++) {                           
      426 -        await covenant.connect(creator).submitEvidence(id, `ip
          -fs://receipt-${i + 1}`);                                      
      427 -      }                                                       
      428 -      await expect(                                           
      429 -        covenant.connect(creator).submitEvidence(id, "late"), 
      430 -      ).to.be.revertedWith("Campaign not active");            
      699 +    it("blocks the platform operator from reviewing their own 
          +campaign", async function () {                                
      700 +      const { covenant, creator, donorA } = await loadFixture(
          +deployFixture);                                               
      701 +      // creator IS the owner here.                           
      702 +      const id = await createDemoCampaign(covenant, creator, [
          +], {                                                          
      703 +        model: ApprovalModel.PlatformOperator,                
      704 +        items: milestoneInputs([M1]),                         
      705 +      });                                                     
      706 +      await covenant.connect(donorA).donate(id, M1);          
      707 +      await covenant.connect(creator).submitProof(id, "s", HAS
          +H1, "");                                                      
      708 +      await expect(covenant.connect(creator).reviewProof(id, t
          +rue, "")).to.be.revertedWith(                                 
      709 +        "Creator cannot review own campaign",                 
      710 +      );                                                      
      711      });
      712  
      433 -    it("reverts when the campaign does not exist", async funct
          -ion () {                                                      
      434 -      const { covenant, creator } = await loadFixture(deployFi
          -xture);                                                       
      713 +    it("reverts when there is no submission to review", async 
          +function () {                                                 
      714 +      const { covenant, reviewer1, id } = await loadFixture(fu
          +ndedFixture);                                                 
      715        await expect(
      436 -        covenant.connect(creator).submitEvidence(99, "ipfs://r
          -eceipt-1"),                                                   
      437 -      ).to.be.revertedWith("Campaign does not exist");        
      716 +        covenant.connect(reviewer1).reviewProof(id, true, ""),
      717 +      ).to.be.revertedWith("No proof awaiting review");       
      718      });
      719    });
      720  
      721    describe("Full lifecycle & campaign completion", function ()
            {
      442 -    it("releases all milestones, completes the campaign, and d
          -rains escrow to zero", async function () {                    
      443 -      const { covenant, usdc, creator, id } = await loadFixtur
          -e(fundedFixture);                                             
      722 +    it("walks all milestones through submit → approve and comp
          +letes the campaign", async function () {                      
      723 +      const { covenant, usdc, creator, reviewer1, id } = await
          + loadFixture(fundedFixture);                                  
      724  
      725        for (let i = 0; i < 3; i++) {
      446 -        await covenant.connect(creator).submitEvidence(id, `ip
          -fs://receipt-${i + 1}`);                                      
      726 +        await covenant.connect(creator).submitProof(id, `Miles
          +tone ${i + 1} done`, HASH1, "");                              
      727 +        await covenant.connect(reviewer1).reviewProof(id, true
          +, "Verified");                                                
      728        }
      729  
      730        const c = await covenant.getCampaign(id);
     ...
      732        expect(c.active).to.equal(false);
      733        expect(c.currentMilestone).to.equal(3n);
      734        expect(c.totalReleased).to.equal(GOAL);
      454 -                                                              
      455 -      // All escrowed USDC has been released.                 
      735        expect(await usdc.balanceOf(await covenant.getAddress())
           ).to.equal(0n);
      736  
      737        const stats = await covenant.getCreatorStats(creator.add
           ress);
      738        expect(stats.campaignsCompleted).to.equal(1n);
      460 -      expect(stats.milestonesCompleted).to.equal(3n);         
      739 +      expect(stats.milestonesApproved).to.equal(3n);          
      740 +      expect(stats.proofSubmissions).to.equal(3n);            
      741      });
      742  
      463 -    it("emits CampaignCompleted on the final milestone and blo
          -cks further evidence", async function () {                    
      464 -      const { covenant, creator, id } = await loadFixture(fund
          -edFixture);                                                   
      743 +    it("emits CampaignCompleted on the final release and block
          +s further writes", async function () {                        
      744 +      const { covenant, creator, donorA, reviewer1, id } = awa
          +it loadFixture(fundedFixture);                                
      745  
      466 -      await covenant.connect(creator).submitEvidence(id, "ipfs
          -://receipt-1");                                               
      467 -      await covenant.connect(creator).submitEvidence(id, "ipfs
          -://receipt-2");                                               
      468 -                                                              
      469 -      await expect(covenant.connect(creator).submitEvidence(id
          -, "ipfs://receipt-3"))                                        
      470 -        .to.emit(covenant, "MilestoneReleased")               
      471 -        .and.to.emit(covenant, "CampaignCompleted")           
      746 +      for (let i = 0; i < 2; i++) {                           
      747 +        await covenant.connect(creator).submitProof(id, `m${i 
          ++ 1}`, HASH1, "");                                            
      748 +        await covenant.connect(reviewer1).reviewProof(id, true
          +, "");                                                        
      749 +      }                                                       
      750 +      await covenant.connect(creator).submitProof(id, "m3", HA
          +SH1, "");                                                     
      751 +      await expect(covenant.connect(reviewer1).reviewProof(id,
          + true, ""))                                                   
      752 +        .to.emit(covenant, "CampaignCompleted")               
      753          .withArgs(id);
      754  
      474 -      // Cannot submit evidence on a completed campaign.      
      755        await expect(
      476 -        covenant.connect(creator).submitEvidence(id, "late"), 
      756 +        covenant.connect(creator).submitProof(id, "late", HASH
          +1, ""),                                                       
      757        ).to.be.revertedWith("Campaign not active");
      758 +      await expect(covenant.connect(donorA).donate(id, usdc6("
          +0.01"))).to.be.revertedWith(                                  
      759 +        "Campaign not active",                                
      760 +      );                                                      
      761      });
      762    });
      763  
      764 +  describe("Deadlines, cancellation and refunds", function () 
          +{                                                             
      765 +    async function deadlineFixture() {                        
      766 +      const base = await deployFixture();                     
      767 +      const { covenant, creator, donorA, donorB, reviewer1 } =
          + base;                                                        
      768 +      const deadline = (await time.latest()) + 10 * DAY;      
      769 +      const id = await createDemoCampaign(covenant, creator, [
          +reviewer1.address], {                                         
      770 +        items: milestoneInputs([M1, M2], [{ proofDeadline: dea
          +dline }, {}]),                                                
      771 +      });                                                     
      772 +      // donorA 0.01, donorB 0.025 — total 0.035 = M1 + M2    
      773 +      await covenant.connect(donorA).donate(id, usdc6("0.01"))
          +;                                                             
      774 +      await covenant.connect(donorB).donate(id, usdc6("0.025")
          +);                                                            
      775 +      return { ...base, id, deadline };                       
      776 +    }                                                         
      777 +                                                              
      778 +    it("cannot be failed before the deadline, and never with n
          +o deadline set", async function () {                          
      779 +      const { covenant, outsider, id } = await loadFixture(dea
          +dlineFixture);                                                
      780 +      expect(await covenant.milestoneFailed(id)).to.equal(fals
          +e);                                                           
      781 +      await expect(covenant.connect(outsider).failCampaign(id)
          +).to.be.revertedWith(                                         
      782 +        "Deadline has not passed",                            
      783 +      );                                                      
      784 +    });                                                       
      785 +                                                              
      786 +    it("lets anyone fail a campaign whose creator missed the p
          +roof deadline, then refunds donors pro-rata", async function (
          +) {                                                           
      787 +      const { covenant, usdc, donorA, donorB, outsider, id, de
          +adline } =                                                    
      788 +        await loadFixture(deadlineFixture);                   
      789 +                                                              
      790 +      await time.increaseTo(deadline + 1);                    
      791 +      expect(await covenant.milestoneFailed(id)).to.equal(true
          +);                                                            
      792 +                                                              
      793 +      await expect(covenant.connect(outsider).failCampaign(id)
          +)                                                             
      794 +        .to.emit(covenant, "CampaignCancelled")               
      795 +        .withArgs(id, 0n, false);                             
      796 +                                                              
      797 +      const c = await covenant.getCampaign(id);               
      798 +      expect(c.active).to.equal(false);                       
      799 +      expect(c.cancelledAt).to.not.equal(0n);                 
      800 +                                                              
      801 +      // Nothing was released, so each donor gets back exactly
          + what they gave.                                              
      802 +      expect(await covenant.refundOf(id, donorA.address)).to.e
          +qual(usdc6("0.01"));                                          
      803 +      expect(await covenant.refundOf(id, donorB.address)).to.e
          +qual(usdc6("0.025"));                                         
      804 +                                                              
      805 +      await expect(covenant.connect(donorA).claimRefund(id)).t
          +o.changeTokenBalances(                                        
      806 +        usdc,                                                 
      807 +        [donorA, covenant],                                   
      808 +        [usdc6("0.01"), -usdc6("0.01")],                      
      809 +      );                                                      
      810 +      await expect(covenant.connect(donorB).claimRefund(id))  
      811 +        .to.emit(covenant, "RefundClaimed")                   
      812 +        .withArgs(id, donorB.address, usdc6("0.025"));        
      813 +                                                              
      814 +      expect(await usdc.balanceOf(await covenant.getAddress())
          +).to.equal(0n);                                               
      815 +                                                              
      816 +      // No double claims; nothing for non-donors.            
      817 +      await expect(covenant.connect(donorA).claimRefund(id)).t
          +o.be.revertedWith(                                            
      818 +        "Nothing to refund",                                  
      819 +      );                                                      
      820 +      await expect(covenant.connect(outsider).claimRefund(id))
          +.to.be.revertedWith(                                          
      821 +        "Nothing to refund",                                  
      822 +      );                                                      
      823 +    });                                                       
      824 +                                                              
      825 +    it("gives reviewers a grace window when proof is submitted
          +, then allows failure", async function () {                   
      826 +      const { covenant, creator, outsider, id, deadline } = aw
          +ait loadFixture(deadlineFixture);                             
      827 +                                                              
      828 +      await covenant.connect(creator).submitProof(id, "on time
          +", HASH1, "");                                                
      829 +                                                              
      830 +      // Deadline passes with the submission stuck in review —
          + not yet failable.                                            
      831 +      await time.increaseTo(deadline + 1);                    
      832 +      expect(await covenant.milestoneFailed(id)).to.equal(fals
          +e);                                                           
      833 +      await expect(covenant.connect(outsider).failCampaign(id)
          +).to.be.revertedWith(                                         
      834 +        "Deadline has not passed",                            
      835 +      );                                                      
      836 +                                                              
      837 +      // Once the review grace window lapses, donors can recov
          +er their funds.                                               
      838 +      await time.increaseTo(deadline + REVIEW_WINDOW + 1);    
      839 +      expect(await covenant.milestoneFailed(id)).to.equal(true
          +);                                                            
      840 +      await expect(covenant.connect(outsider).failCampaign(id)
          +).to.emit(                                                    
      841 +        covenant,                                             
      842 +        "CampaignCancelled",                                  
      843 +      );                                                      
      844 +    });                                                       
      845 +                                                              
      846 +    it("refunds only the unreleased escrow after a mid-campaig
          +n cancellation", async function () {                          
      847 +      const { covenant, usdc, creator, donorA, donorB, reviewe
          +r1, id } =                                                    
      848 +        await loadFixture(deadlineFixture);                   
      849 +                                                              
      850 +      // Milestone one (0.02) releases legitimately.          
      851 +      await covenant.connect(creator).submitProof(id, "m1 done
          +", HASH1, "");                                                
      852 +      await covenant.connect(reviewer1).reviewProof(id, true, 
          +"");                                                          
      853 +                                                              
      854 +      // Creator then cancels. Unreleased escrow = 0.035 - 0.0
          +2 = 0.015.                                                    
      855 +      await expect(covenant.connect(creator).cancelCampaign(id
          +))                                                            
      856 +        .to.emit(covenant, "CampaignCancelled")               
      857 +        .withArgs(id, 1n, true);                              
      858 +                                                              
      859 +      // Pro-rata: donorA 0.01/0.035, donorB 0.025/0.035 of 0.
          +015.                                                          
      860 +      const unreleased = usdc6("0.015");                      
      861 +      const expectA = (usdc6("0.01") * unreleased) / usdc6("0.
          +035");                                                        
      862 +      const expectB = (usdc6("0.025") * unreleased) / usdc6("0
          +.035");                                                       
      863 +      expect(await covenant.refundOf(id, donorA.address)).to.e
          +qual(expectA);                                                
      864 +      expect(await covenant.refundOf(id, donorB.address)).to.e
          +qual(expectB);                                                
      865 +                                                              
      866 +      await covenant.connect(donorA).claimRefund(id);         
      867 +      await covenant.connect(donorB).claimRefund(id);         
      868 +                                                              
      869 +      // Only integer-division dust (< 2 units) may remain.   
      870 +      expect(await usdc.balanceOf(await covenant.getAddress())
          +).to.be.lessThan(2n);                                         
      871 +    });                                                       
      872 +                                                              
      873 +    it("blocks refunds while the campaign is live, and all wri
          +tes after cancellation", async function () {                  
      874 +      const { covenant, creator, donorA, reviewer1, id } = awa
          +it loadFixture(deadlineFixture);                              
      875 +                                                              
      876 +      await expect(covenant.connect(donorA).claimRefund(id)).t
          +o.be.revertedWith(                                            
      877 +        "Campaign not cancelled",                             
      878 +      );                                                      
      879 +      await expect(covenant.connect(donorA).cancelCampaign(id)
          +).to.be.revertedWith(                                         
      880 +        "Only creator",                                       
      881 +      );                                                      
      882 +                                                              
      883 +      await covenant.connect(creator).cancelCampaign(id);     
      884 +                                                              
      885 +      await expect(covenant.connect(donorA).donate(id, usdc6("
          +0.001"))).to.be.revertedWith(                                 
      886 +        "Campaign not active",                                
      887 +      );                                                      
      888 +      await expect(                                           
      889 +        covenant.connect(creator).submitProof(id, "s", HASH1, 
          +""),                                                          
      890 +      ).to.be.revertedWith("Campaign not active");            
      891 +      await expect(covenant.connect(reviewer1).reviewProof(id,
          + true, "")).to.be.revertedWith(                               
      892 +        "Campaign not active",                                
      893 +      );                                                      
      894 +      await expect(covenant.connect(creator).cancelCampaign(id
          +)).to.be.revertedWith(                                        
      895 +        "Campaign not active",                                
      896 +      );                                                      
      897 +    });                                                       
      898 +  });                                                         
      899 +                                                              
      900    describe("Reputation / trust score", function () {
      482 -    it("starts at zero and increases as milestones are proven 
          -and the campaign completes", async function () {              
      483 -      const { covenant, creator, id } = await loadFixture(fund
          -edFixture);                                                   
      901 +    it("scores verified outcomes only — raw submissions and re
          +jections earn nothing", async function () {                   
      902 +      const { covenant, creator, reviewer1, id } = await loadF
          +ixture(fundedFixture);                                        
      903  
      485 -      // Brand new creator with one created campaign: base sco
          -re of 10 (New Creator).                                       
      904 +      // One created campaign: base score.                    
      905        expect(await covenant.trustScore(creator.address)).to.eq
           ual(10n);
      906  
      488 -      // Complete milestone 1 (1 evidence + 1 milestone): 10 +
          - 12 + 3 = 25 (Early Creator).                                 
      489 -      await covenant.connect(creator).submitEvidence(id, "ipfs
          -://receipt-1");                                               
      490 -      expect(await covenant.trustScore(creator.address)).to.eq
          -ual(25n);                                                     
      907 +      // Submitting proof does NOT move the score.            
      908 +      await covenant.connect(creator).submitProof(id, "m1", HA
          +SH1, "");                                                     
      909 +      expect(await covenant.trustScore(creator.address)).to.eq
          +ual(10n);                                                     
      910  
      492 -      // Complete the remaining two milestones and the campaig
          -n.                                                            
      493 -      await covenant.connect(creator).submitEvidence(id, "ipfs
          -://receipt-2");                                               
      494 -      await covenant.connect(creator).submitEvidence(id, "ipfs
          -://receipt-3");                                               
      911 +      // A rejection doesn't either.                          
      912 +      await covenant.connect(reviewer1).reviewProof(id, false,
          + "Insufficient");                                             
      913 +      expect(await covenant.trustScore(creator.address)).to.eq
          +ual(10n);                                                     
      914  
      496 -      // 10 base + 3*12 milestones + 1*15 campaign + min(3*3,1
          -5)=9 evidence = 70 (Proven Creator).                          
      497 -      expect(await covenant.trustScore(creator.address)).to.eq
          -ual(70n);                                                     
      915 +      // A verified approval does: 10 + 12.                   
      916 +      await covenant.connect(creator).submitProof(id, "m1 fixe
          +d", HASH2, "");                                               
      917 +      await covenant.connect(reviewer1).reviewProof(id, true, 
          +"");                                                          
      918 +      expect(await covenant.trustScore(creator.address)).to.eq
          +ual(22n);                                                     
      919 +                                                              
      920 +      // Completing the campaign: 10 + 3*12 + 15 = 61.        
      921 +      for (let i = 0; i < 2; i++) {                           
      922 +        await covenant.connect(creator).submitProof(id, `m${i 
          ++ 2}`, HASH1, "");                                            
      923 +        await covenant.connect(reviewer1).reviewProof(id, true
          +, "");                                                        
      924 +      }                                                       
      925 +      expect(await covenant.trustScore(creator.address)).to.eq
          +ual(61n);                                                     
      926      });
      927  
      928      it("returns zero for an address that has never created a c
           ampaign", async function () {

❯ The other thing is I want you to redesign how the escrow contract works so    
  the user should be able to submit proof, and then that auto releases the      
  funds. No, the user should not just be able to submit proof and then that     
  auto releases the funds, right?                                               
                                                                                
  The whole point is that the user needs to submit the proof, then the donor    
  has to review that proof, and then they can approve or reject the proof,      
  right? If they approve, then the proof will be released. If they reject it,   
  the fundraiser will only have a certain amount of time until they actually    
  have to get the proof. Otherwise, the money will no longer be saved in the    
  smart contract and will go back to the VC fund, the angel investor, the       
  insurance firm, or whoever the donor in this case would be.                   

⏺ Update(~/Downloads/tracefund/packages/hardhat/contracts/Covenant.sol)
  ⎿  Added 7 lines, removed 2 lines
      46  
      47      uint256 public constant MAX_MILESTONES = 5;
      48      uint256 public constant MAX_REVIEWERS = 7;
      49 -    /// @notice Grace period reviewers get past the proof deadl
         -ine while a                                                    
      50 -    ///         submission is pending review, before the campai
         -gn can be failed.                                              
      49 +    /// @notice How long reviewers have to act on a submission 
         +before the                                                     
      50 +    ///         campaign can be failed and donors refunded. Run
         +s from the                                                     
      51 +    ///         later of the submission time and the proof dead
         +line.                                                          
      52      uint256 public constant REVIEW_WINDOW = 14 days;
      53 +    /// @notice How long a creator has to revise and resubmit a
         +fter a                                                         
      54 +    ///         rejection. After it lapses (or the milestone's 
         +own deadline,                                                  
      55 +    ///         whichever comes first), donors can recover thei
         +r funds.                                                       
      56 +    uint256 public constant REVISION_WINDOW = 14 days;         
      57  
      58      // Anti-spam limits. Campaign creation is nearly free on an
           L2, so an
      59      // unapproved address gets a small lifetime allowance and a
           cooldown;

⏺ Update(~/Downloads/tracefund/packages/hardhat/contracts/Covenant.sol)
  ⎿  Added 1 line
      118          MilestoneState state;
      119          uint32 submissionCount;   // proof packages submitted 
           so far
      120          uint8 approvalCount;      // approvals for the latest 
           submission
      121 +        uint64 revisionDeadline;  // set on rejection: resubmi
          +t by this time or fail                                        
      122          bool released;
      123      }
      124  

⏺ Update(~/Downloads/tracefund/packages/hardhat/contracts/Covenant.sol)
  ⎿  Added 1 line
      314                      state: MilestoneState.Pending,
      315                      submissionCount: 0,
      316                      approvalCount: 0,
      317 +                    revisionDeadline: 0,                      
      318                      released: false
      319                  })
      320              );

⏺ Update(~/Downloads/tracefund/packages/hardhat/contracts/Covenant.sol)
  ⎿  Added 4 lines
      437          );
      438          uint64 deadline = m.criteria.proofDeadline;
      439          require(deadline == 0 || block.timestamp <= deadline, 
           "Proof deadline passed");
      440 +        // Resubmissions after a rejection must land inside th
          +e revision window.                                            
      441 +        if (m.state == MilestoneState.ChangesRequested) {     
      442 +            require(block.timestamp <= m.revisionDeadline, "Re
          +vision window closed");                                       
      443 +        }                                                     
      444          // The tranche must be funded before review starts; re
           leasing an
      445          // underfunded milestone would draw from other campaig
           ns' escrow.
      446          require(c.totalReleased + m.amount <= c.totalRaised, "
           Milestone not funded");

⏺ Update(~/Downloads/tracefund/packages/hardhat/contracts/Covenant.sol)
  ⎿  Added 3 lines, removed 1 line
      508  
      509          if (!approve) {
      510              // One rejection sends the package back for revisi
           on. Escrow stays
      511 -            // locked; any approvals already cast apply only t
          -o that submission.                                            
      511 +            // locked, and the creator gets a bounded window t
          +o fix the proof —                                             
      512 +            // after that, donors can fail the campaign and re
          +claim their funds.                                            
      513              m.state = MilestoneState.ChangesRequested;
      514 +            m.revisionDeadline = uint64(block.timestamp + REVI
          +SION_WINDOW);                                                 
      515              return;
      516          }
      517  

⏺ Now the updated failure predicate — covering creator disappearance, reviewer
  disappearance, and blown revision windows:

⏺ Update(~/Downloads/tracefund/packages/hardhat/contracts/Covenant.sol)
  ⎿  Added 21 lines, removed 8 lines
      616      }
      617  
      618      /**
      619 -     * @notice True when the current milestone's deadline has 
          -passed without an                                             
      620 -     *         approved release: creator missed the proof dead
          -line, or a                                                    
      621 -     *         submission sat unreviewed past deadline + REVIE
          -W_WINDOW. When                                                
      622 -     *         true, failCampaign() can be called by anyone.  
      619 +     * @notice True when the current milestone is stuck withou
          +t an approved                                                 
      620 +     *         release and donors should be able to recover th
          +eir funds:                                                    
      621 +     *         - Pending past its proof deadline (creator disa
          +ppeared),                                                     
      622 +     *         - Submitted but unreviewed for REVIEW_WINDOW pa
          +st the later of                                               
      623 +     *           submission time and deadline (reviewers disap
          +peared),                                                      
      624 +     *         - ChangesRequested past the revision window or 
          +the deadline                                                  
      625 +     *           (creator never fixed the rejected proof).    
      626 +     *         When true, failCampaign() can be called by anyo
          +ne.                                                           
      627       */
      628      function milestoneFailed(uint256 campaignId)
      629          public
     ...
      637          if (mi >= c.milestoneCount) return false;
      638          Milestone storage m = _milestones[campaignId][mi];
      639          uint64 deadline = m.criteria.proofDeadline;
      636 -        if (deadline == 0) return false;                      
      640 +                                                              
      641          if (m.state == MilestoneState.Submitted) {
      638 -            return block.timestamp > uint256(deadline) + REVIE
          -W_WINDOW;                                                     
      642 +            ProofSubmission[] storage subs = _submissions[camp
          +aignId][mi];                                                  
      643 +            uint256 submittedAt = subs[subs.length - 1].submit
          +tedAt;                                                        
      644 +            uint256 reviewStart = deadline > submittedAt ? dea
          +dline : submittedAt;                                          
      645 +            return block.timestamp > reviewStart + REVIEW_WIND
          +OW;                                                           
      646          }
      640 -        // Pending or ChangesRequested: the creator had until 
          -the deadline.                                                 
      641 -        return block.timestamp > deadline;                    
      647 +        if (m.state == MilestoneState.ChangesRequested) {     
      648 +            if (block.timestamp > m.revisionDeadline) return t
          +rue;                                                          
      649 +            return deadline != 0 && block.timestamp > deadline
          +;                                                             
      650 +        }                                                     
      651 +        // Pending: the creator had until the deadline to subm
          +it anything at                                                
      652 +        // all. With no deadline set there is no timeout path 
          +— the UI pushes                                               
      653 +        // creators to set one, and voluntary cancellation sta
          +ys available.                                                 
      654 +        return deadline != 0 && block.timestamp > deadline;   
      655      }
      656  
      657      /// @notice Whether an address currently holds review auth
           ority for a campaign.

⏺ Adding tests for the revision window and reviewer-inaction paths, then running
  the suite:

⏺ Update(~/Downloads/tracefund/packages/hardhat/test/Covenant.ts)
  ⎿  Added 58 lines
      843        );
      844      });
      845  
      846 +    it("gives a rejected creator a bounded revision window eve
          +n with no milestone deadline", async function () {            
      847 +      // No proofDeadline at all — the rejection itself must s
          +tart the clock.                                               
      848 +      const { covenant, creator, donorA, reviewer1, outsider }
          + =                                                            
      849 +        await loadFixture(deployFixture);                     
      850 +      const id = await createDemoCampaign(covenant, creator, [
          +reviewer1.address], {                                         
      851 +        items: milestoneInputs([M1]),                         
      852 +      });                                                     
      853 +      await covenant.connect(donorA).donate(id, M1);          
      854 +      await covenant.connect(creator).submitProof(id, "v1", HA
          +SH1, "");                                                     
      855 +      await covenant.connect(reviewer1).reviewProof(id, false,
          + "Not sufficient");                                           
      856 +                                                              
      857 +      const m = await covenant.getMilestone(id, 0);           
      858 +      expect(m.revisionDeadline).to.be.greaterThan(0n);       
      859 +                                                              
      860 +      // Inside the window: resubmission works, failure doesn'
          +t.                                                            
      861 +      expect(await covenant.milestoneFailed(id)).to.equal(fals
          +e);                                                           
      862 +      await expect(covenant.connect(outsider).failCampaign(id)
          +).to.be.revertedWith(                                         
      863 +        "Deadline has not passed",                            
      864 +      );                                                      
      865 +                                                              
      866 +      // Window lapses without a fix: resubmission is closed, 
          +refunds open.                                                 
      867 +      await time.increase(REVIEW_WINDOW + 1);                 
      868 +      await expect(                                           
      869 +        covenant.connect(creator).submitProof(id, "too late", 
          +HASH2, ""),                                                   
      870 +      ).to.be.revertedWith("Revision window closed");         
      871 +      expect(await covenant.milestoneFailed(id)).to.equal(true
          +);                                                            
      872 +      await covenant.connect(outsider).failCampaign(id);      
      873 +      expect(await covenant.refundOf(id, donorA.address)).to.e
          +qual(M1);                                                     
      874 +    });                                                       
      875 +                                                              
      876 +    it("resubmitting inside the revision window restarts revie
          +w cleanly", async function () {                               
      877 +      const { covenant, creator, reviewer1, id } = await loadF
          +ixture(submittedFixture);                                     
      878 +      await covenant.connect(reviewer1).reviewProof(id, false,
          + "Wrong file");                                               
      879 +      await covenant.connect(creator).submitProof(id, "v2", HA
          +SH2, "");                                                     
      880 +      expect(await covenant.milestoneFailed(id)).to.equal(fals
          +e);                                                           
      881 +      await expect(covenant.connect(reviewer1).reviewProof(id,
          + true, "")).to.emit(                                          
      882 +        covenant,                                             
      883 +        "MilestoneReleased",                                  
      884 +      );                                                      
      885 +    });                                                       
      886 +                                                              
      887 +    it("lets donors recover funds when reviewers go silent on 
          +an undeadlined milestone", async function () {                
      888 +      const { covenant, creator, donorA, reviewer1, outsider }
          + =                                                            
      889 +        await loadFixture(deployFixture);                     
      890 +      const id = await createDemoCampaign(covenant, creator, [
          +reviewer1.address], {                                         
      891 +        items: milestoneInputs([M1]), // no proofDeadline     
      892 +      });                                                     
      893 +      await covenant.connect(donorA).donate(id, M1);          
      894 +      await covenant.connect(creator).submitProof(id, "v1", HA
          +SH1, "");                                                     
      895 +                                                              
      896 +      // Reviewers get REVIEW_WINDOW from submission; then any
          +one can fail.                                                 
      897 +      expect(await covenant.milestoneFailed(id)).to.equal(fals
          +e);                                                           
      898 +      await time.increase(REVIEW_WINDOW + 1);                 
      899 +      expect(await covenant.milestoneFailed(id)).to.equal(true
          +);                                                            
      900 +      await covenant.connect(outsider).failCampaign(id);      
      901 +      expect(await covenant.refundOf(id, donorA.address)).to.e
          +qual(M1);                                                     
      902 +    });                                                       
      903 +                                                              
      904      it("refunds only the unreleased escrow after a mid-campaig
           n cancellation", async function () {
      905        const { covenant, usdc, creator, donorA, donorB, reviewe
           r1, id } =
      906          await loadFixture(deadlineFixture);

  Ran 1 shell command (ctrl+o to expand)

⏺ All 40 tests pass — the contract redesign and test suite are done. Moving to
  the frontend layer:

  Ran 1 shell command (ctrl+o to expand)

⏺ Now writing the frontend foundation — types, manifest/hashing utilities,
  evidence registry adapter, and updated format helpers:

⏺ Write(lib/types.ts)
  ⎿  Added 98 lines, removed 11 lines
       1  // Shapes that mirror the Covenant.sol structs. viem decodes na
          med tuple
       2 -// outputs into objects with these exact field names.          
       2 +// outputs into objects with these exact field names; enum valu
         +es arrive as                                                   
       3 +// plain numbers matching Solidity declaration order.          
       4  
       5 +export const ApprovalModel = {                                 
       6 +  DesignatedReviewers: 0,                                      
       7 +  LeadDonor: 1,                                                
       8 +  PlatformOperator: 2,                                         
       9 +  /** Reserved in the contract but rejected at creation — donor
         +-wide voting                                                   
      10 +   *  needs snapshot + quorum design before it can be enabled. 
         +*/                                                             
      11 +  DonorVote: 3,                                                
      12 +} as const;                                                    
      13 +export type ApprovalModelValue = (typeof ApprovalModel)[keyof t
         +ypeof ApprovalModel];                                          
      14 +                                                               
      15 +export const MilestoneState = {                                
      16 +  Pending: 0,                                                  
      17 +  Submitted: 1,                                                
      18 +  ChangesRequested: 2,                                         
      19 +  Approved: 3,                                                 
      20 +} as const;                                                    
      21 +export type MilestoneStateValue = (typeof MilestoneState)[keyof
         + typeof MilestoneState];                                       
      22 +                                                               
      23 +export const CampaignKind = {                                  
      24 +  Charity: 0,                                                  
      25 +  Startup: 1,                                                  
      26 +  Grant: 2,                                                    
      27 +  Other: 3,                                                    
      28 +} as const;                                                    
      29 +export type CampaignKindValue = (typeof CampaignKind)[keyof typ
         +eof CampaignKind];                                             
      30 +                                                               
      31 +/** What the reviewer evaluates. Evidence stays flexible; crite
         +ria don't. */                                                  
      32 +export interface MilestoneCriteria {                           
      33 +  title: string;                                               
      34 +  successDefinition: string;                                   
      35 +  reportingPeriod: string;                                     
      36 +  expectedMetrics: string;                                     
      37 +  requiredProof: string;                                       
      38 +  /** Unix seconds; 0n = no deadline (no timeout/refund path fo
         +r this milestone). */                                          
      39 +  proofDeadline: bigint;                                       
      40 +}                                                              
      41 +                                                               
      42  export interface Milestone {
       5 -  description: string;                                         
      43 +  criteria: MilestoneCriteria;                                 
      44    amount: bigint;
       7 -  evidence: string;                                            
       8 -  evidenceSubmitted: boolean;                                  
      45 +  state: MilestoneStateValue;                                  
      46 +  submissionCount: number;                                     
      47 +  approvalCount: number;                                       
      48 +  /** Set when a reviewer rejects: the creator must resubmit by
         + this time. */                                                 
      49 +  revisionDeadline: bigint;                                    
      50    released: boolean;
      51  }
      52  
      53 +/** On-chain record of one proof package. The full package (nar
         +rative,                                                        
      54 + *  justification, metrics, evidence links) lives off-chain; th
         +e chain holds                                                  
      55 + *  its keccak256 hash, an optional public pointer, and a short
         + summary. */                                                   
      56 +export interface ProofSubmission {                             
      57 +  manifestHash: `0x${string}`;                                 
      58 +  manifestURI: string;                                         
      59 +  summary: string;                                             
      60 +  submittedAt: bigint;                                         
      61 +}                                                              
      62 +                                                               
      63 +export interface ReviewDecision {                              
      64 +  reviewer: `0x${string}`;                                     
      65 +  approved: boolean;                                           
      66 +  notes: string;                                               
      67 +  decidedAt: bigint;                                           
      68 +  submissionIndex: number;                                     
      69 +}                                                              
      70 +                                                               
      71 +export interface ApprovalConfig {                              
      72 +  model: ApprovalModelValue;                                   
      73 +  reviewers: readonly `0x${string}`[];                         
      74 +  threshold: number;                                           
      75 +}                                                              
      76 +                                                               
      77  export interface Campaign {
      78    id: bigint;
      79    creator: `0x${string}`;
      80    title: string;
      81    description: string;
      82 +  kind: CampaignKindValue;                                     
      83    goalAmount: bigint;
      84    totalRaised: bigint;
      85    totalReleased: bigint;
      86    active: boolean;
      87    completed: boolean;
      88 +  /** 0n = not cancelled. Non-zero opens pro-rata refunds for d
         +onors. */                                                      
      89 +  cancelledAt: bigint;                                         
      90    currentMilestone: bigint;
      91    createdAt: bigint;
      92    donorCount: bigint;
     ...
       98    campaignsCompleted: bigint;
       99    totalRaised: bigint;
      100    totalReleased: bigint;
       33 -  milestonesCompleted: bigint;                                
       34 -  evidenceUpdates: bigint;                                    
      101 +  /** Reviewer-verified milestone completions — the only thing
          + reputation rewards. */                                       
      102 +  milestonesApproved: bigint;                                 
      103 +  /** Informational; submissions never move the trust score. *
          +/                                                             
      104 +  proofSubmissions: bigint;                                   
      105  }
      106  
       37 -// Per-milestone UI status derived from on-chain state.       
      107 +// Per-milestone UI status derived from on-chain state + fundi
          +ng + deadlines.                                               
      108  export type MilestoneStatus =
       39 -  | "locked"             // future milestone, not yet reachabl
          -e                                                             
       40 -  | "funding"            // active, waiting for donations     
       41 -  | "awaiting-evidence"  // active with donations, creator has
          -n't posted proof yet                                          
       42 -  | "released";          // funds released to creator         
      109 +  | "locked" //             future milestone, not yet reachabl
          +e                                                             
      110 +  | "funding" //            active, tranche not yet covered by
          + donations                                                    
      111 +  | "awaiting-proof" //     funded, waiting on the creator's p
          +roof package                                                  
      112 +  | "under-review" //       proof submitted, reviewers decidin
          +g                                                             
      113 +  | "changes-requested" //  rejected with notes, creator revis
          +ing                                                           
      114 +  | "approved" //           reviewers approved; funds released
      115 +  | "expired"; //           deadline blown — campaign can be f
          +ailed / refunded                                              
      116 +                                                              
      117 +export const APPROVAL_MODEL_LABELS: Record<ApprovalModelValue,
          + string> = {                                                  
      118 +  [ApprovalModel.DesignatedReviewers]: "Designated reviewers",
      119 +  [ApprovalModel.LeadDonor]: "Lead donor",                    
      120 +  [ApprovalModel.PlatformOperator]: "Platform operator",      
      121 +  [ApprovalModel.DonorVote]: "Donor vote (coming soon)",      
      122 +};                                                            
      123 +                                                              
      124 +export const CAMPAIGN_KIND_LABELS: Record<CampaignKindValue, s
          +tring> = {                                                    
      125 +  [CampaignKind.Charity]: "Charity / community",              
      126 +  [CampaignKind.Startup]: "Startup / VC",                     
      127 +  [CampaignKind.Grant]: "Grant program",                      
      128 +  [CampaignKind.Other]: "Other",                              
      129 +};                                                            

⏺ Write(lib/proofManifest.ts)
  ⎿  Wrote 92 lines to lib/proofManifest.ts
       1 import { keccak256, toBytes } from "viem";
       3 /**
       4  * The proof-package manifest: the canonical off-chain record of
          one proof
         ary and an
       6  * OPTIONAL public pointer) goes on-chain — sensitive evidence U
       7  * have to be published.
       8  *
       9  * On-chain / off-chain boundary:
         elow),
     … +106 lines (ctrl+o to expand)
  Read 3 files, listed 1 directory (ctrl+o to expand)

⏺ The indexer gives me a real off-chain registry to target. Writing the registry
  adapter (indexer-backed with localStorage fallback, hash-capability access
  model documented):

⏺ Write(lib/evidenceRegistry.ts)
  ⎿  Wrote 89 lines to lib/evidenceRegistry.ts
       1 import type { ProofManifest } from "./proofManifest";
         nifest";
       3 
       4 /**
         when the
       6  * creator does NOT publish them on-chain.
       8  * Storage tiers, in order:
       9  *  1. The Covenant indexer (packages/indexer) exposes PUT/GET /
         evidence/:hash.
         essable
     … +98 lines (ctrl+o to expand)

⏺ Update(lib/format.ts)
  ⎿  Added 1 line
      1  import { formatUnits } from "viem";
      2  import type { Campaign, Milestone, MilestoneStatus } from "./typ
         es";
      3 +import { MilestoneState } from "./types";                       
      4  
      5  /** USDC uses 6 decimals — every on-chain amount is in USDC base
          units. */
      6  export const USDC_DECIMALS = 6;

⏺ Update(lib/format.ts)
  ⎿  Added 19 lines, removed 3 lines
      40    return new Date(ts).toLocaleDateString();
      41  }
      42  
      43 +/** Seconds → ms guard for on-chain uint64 timestamps (0n = uns
         +et). */                                                        
      44 +const pastDeadline = (deadline: bigint) =>                     
      45 +  deadline !== 0n && Date.now() / 1000 > Number(deadline);     
      46 +                                                               
      47  export function milestoneStatus(
      48    milestone: Milestone,
      49    index: number,
      50    currentMilestone: number,
      51 +  cumulativeTarget: bigint,                                    
      52    totalRaised: bigint,
      53  ): MilestoneStatus {
      49 -  if (milestone.released) return "released";                   
      54 +  if (milestone.released || milestone.state === MilestoneState.
         +Approved) return "approved";                                   
      55    if (index > currentMilestone) return "locked";
      51 -  if (totalRaised === 0n) return "funding";                    
      52 -  return "awaiting-evidence";                                  
      56 +  if (milestone.state === MilestoneState.Submitted) {          
      57 +    return "under-review";                                     
      58 +  }                                                            
      59 +  if (milestone.state === MilestoneState.ChangesRequested) {   
      60 +    return pastDeadline(milestone.revisionDeadline) ||         
      61 +      pastDeadline(milestone.criteria.proofDeadline)           
      62 +      ? "expired"                                              
      63 +      : "changes-requested";                                   
      64 +  }                                                            
      65 +  // Pending                                                   
      66 +  if (pastDeadline(milestone.criteria.proofDeadline)) return "e
         +xpired";                                                       
      67 +  if (totalRaised < cumulativeTarget) return "funding";        
      68 +  return "awaiting-proof";                                     
      69  }
      70  
      71  interface StatusMeta {

⏺ Update(lib/format.ts)
  ⎿  Added 21 lines, removed 3 lines
       76  
       77  export function milestoneStatusMeta(status: MilestoneStatus): 
           StatusMeta {
       78    switch (status) {
       79 -    case "released":                                          
       79 +    case "approved":                                          
       80        return {
       81 -        label: "Released",                                    
       81 +        label: "Approved · released",                         
       82          pill: "bg-[var(--brand-secondary)] text-[var(--brand-p
           rimary)] ring-1 ring-[var(--brand-primary)]/25",
       83          dot: "bg-[var(--brand-primary)]",
       84        };
       85 -    case "awaiting-evidence":                                 
       85 +    case "under-review":                                      
       86        return {
       87 +        label: "Under review",                                
       88 +        pill: "bg-violet-600/10 text-violet-700 ring-1 ring-vi
          +olet-600/25",                                                 
       89 +        dot: "bg-violet-600 animate-pulse",                   
       90 +      };                                                      
       91 +    case "changes-requested":                                 
       92 +      return {                                                
       93 +        label: "Changes requested",                           
       94 +        pill: "bg-orange-600/10 text-orange-700 ring-1 ring-or
          +ange-600/25",                                                 
       95 +        dot: "bg-orange-600",                                 
       96 +      };                                                      
       97 +    case "awaiting-proof":                                    
       98 +      return {                                                
       99          label: "Awaiting proof",
      100          pill: "bg-amber-600/10 text-amber-700 ring-1 ring-ambe
           r-600/25",
      101          dot: "bg-amber-600 animate-pulse",
     ...
      106          pill: "bg-sky-600/10 text-sky-700 ring-1 ring-sky-600/
           25",
      107          dot: "bg-sky-600",
      108        };
      109 +    case "expired":                                           
      110 +      return {                                                
      111 +        label: "Deadline missed",                             
      112 +        pill: "bg-red-600/10 text-red-700 ring-1 ring-red-600/
          +25",                                                          
      113 +        dot: "bg-red-600",                                    
      114 +      };                                                      
      115      case "locked":
      116      default:
      117        return {

⏺ Update(lib/format.ts)
  ⎿  Added 13 lines
      126    if (campaign.completed) {
      127      return { label: "Completed", pill: "bg-[var(--brand-second
           ary)] text-[var(--brand-primary)] ring-1 ring-[var(--brand-pri
           mary)]/25" };
      128    }
      129 +  if (campaign.cancelledAt !== 0n) {                          
      130 +    return { label: "Cancelled · refunds open", pill: "bg-red-
          +600/10 text-red-700 ring-1 ring-red-600/25" };                
      131 +  }                                                           
      132    if (campaign.active) {
      133      return { label: "Active", pill: "bg-sky-600/10 text-sky-70
           0 ring-1 ring-sky-600/25" };
      134    }
      135    return { label: "Closed", pill: "bg-[var(--bg-subtle)] text-
           [var(--text-tertiary)] ring-1 ring-[var(--border-primary)]" };
      136  }
      137 +                                                              
      138 +/** Render a uint64 seconds deadline for the UI ("" when unset
          +). */                                                         
      139 +export function formatDeadline(deadline: bigint | undefined): 
          +string {                                                      
      140 +  if (!deadline || deadline === 0n) return "";                
      141 +  return new Date(Number(deadline) * 1000).toLocaleDateString(
          +undefined, {                                                  
      142 +    year: "numeric",                                          
      143 +    month: "short",                                           
      144 +    day: "numeric",                                           
      145 +  });                                                         
      146 +}                                                             

⏺ Now the hooks — extending useCovenant.ts with the new read/write surface:

⏺ Update(hooks/useCovenant.ts)
  ⎿  Added 8 lines, removed 1 line
      18    resolveReadChainId,
      19    supportsContractFunction,
      20  } from "../lib/contract";
      21 -import type { Campaign, CreatorStats, Milestone } from "../lib/
         -types";                                                        
      21 +import type {                                                  
      22 +  ApprovalConfig,                                              
      23 +  Campaign,                                                    
      24 +  CreatorStats,                                                
      25 +  Milestone,                                                   
      26 +  ProofSubmission,                                             
      27 +  ReviewDecision,                                              
      28 +} from "../lib/types";                                         
      29  
      30  export function useReadChain() {
      31    const connectedChainId = useChainId();

⏺ Update(hooks/useCovenant.ts)
  ⎿  Added 98 lines, removed 1 line
      166    };
      167  }
      168  
      169 -export type CovenantFn = "createCampaign" | "donate" | "submit
          -Evidence";                                                    
      169 +/** The campaign's approval authority configuration. */       
      170 +export function useApprovalConfig(id?: bigint) {              
      171 +  const { address, abi, chainId } = useReadChain();           
      172 +  const q = useReadContract({                                 
      173 +    address,                                                  
      174 +    abi,                                                      
      175 +    functionName: "getApprovalConfig",                        
      176 +    args: id !== undefined ? [id] : undefined,                
      177 +    chainId,                                                  
      178 +    query: { enabled: !!address && id !== undefined },        
      179 +  });                                                         
      180 +  return { ...q, config: q.data as ApprovalConfig | undefined 
          +};                                                            
      181 +}                                                             
      182  
      183 +/** All proof packages submitted for one milestone (oldest fir
          +st). */                                                       
      184 +export function useSubmissions(id?: bigint, milestoneIndex?: n
          +umber) {                                                      
      185 +  const { address, abi, chainId } = useReadChain();           
      186 +  const q = useReadContract({                                 
      187 +    address,                                                  
      188 +    abi,                                                      
      189 +    functionName: "getSubmissions",                           
      190 +    args:                                                     
      191 +      id !== undefined && milestoneIndex !== undefined        
      192 +        ? [id, BigInt(milestoneIndex)]                        
      193 +        : undefined,                                          
      194 +    chainId,                                                  
      195 +    query: { enabled: !!address && id !== undefined && milesto
          +neIndex !== undefined },                                      
      196 +  });                                                         
      197 +  return { ...q, submissions: (q.data as ProofSubmission[] | u
          +ndefined) ?? [] };                                            
      198 +}                                                             
      199 +                                                              
      200 +/** Every review decision recorded for one milestone (oldest f
          +irst). */                                                     
      201 +export function useReviews(id?: bigint, milestoneIndex?: numbe
          +r) {                                                          
      202 +  const { address, abi, chainId } = useReadChain();           
      203 +  const q = useReadContract({                                 
      204 +    address,                                                  
      205 +    abi,                                                      
      206 +    functionName: "getReviews",                               
      207 +    args:                                                     
      208 +      id !== undefined && milestoneIndex !== undefined        
      209 +        ? [id, BigInt(milestoneIndex)]                        
      210 +        : undefined,                                          
      211 +    chainId,                                                  
      212 +    query: { enabled: !!address && id !== undefined && milesto
          +neIndex !== undefined },                                      
      213 +  });                                                         
      214 +  return { ...q, reviews: (q.data as ReviewDecision[] | undefi
          +ned) ?? [] };                                                 
      215 +}                                                             
      216 +                                                              
      217 +/** Whether an account currently holds review authority for a 
          +campaign. */                                                  
      218 +export function useIsReviewer(id?: bigint, account?: `0x${stri
          +ng}`) {                                                       
      219 +  const { address, abi, chainId } = useReadChain();           
      220 +  const q = useReadContract({                                 
      221 +    address,                                                  
      222 +    abi,                                                      
      223 +    functionName: "isReviewer",                               
      224 +    args: id !== undefined && account ? [id, account] : undefi
          +ned,                                                          
      225 +    chainId,                                                  
      226 +    query: { enabled: !!address && id !== undefined && !!accou
          +nt },                                                         
      227 +  });                                                         
      228 +  return { ...q, isReviewer: (q.data as boolean | undefined) ?
          +? false };                                                    
      229 +}                                                             
      230 +                                                              
      231 +/** A donor's claimable USDC refund (0 unless the campaign was
          + cancelled). */                                               
      232 +export function useRefund(id?: bigint, donor?: `0x${string}`) 
          +{                                                             
      233 +  const { address, abi, chainId } = useReadChain();           
      234 +  const q = useReadContract({                                 
      235 +    address,                                                  
      236 +    abi,                                                      
      237 +    functionName: "refundOf",                                 
      238 +    args: id !== undefined && donor ? [id, donor] : undefined,
      239 +    chainId,                                                  
      240 +    query: { enabled: !!address && id !== undefined && !!donor
          + },                                                           
      241 +  });                                                         
      242 +  return { ...q, refund: (q.data as bigint | undefined) ?? 0n 
          +};                                                            
      243 +}                                                             
      244 +                                                              
      245 +/** True when the current milestone blew its deadline and anyo
          +ne may fail the campaign. */                                  
      246 +export function useMilestoneFailed(id?: bigint) {             
      247 +  const { address, abi, chainId } = useReadChain();           
      248 +  const q = useReadContract({                                 
      249 +    address,                                                  
      250 +    abi,                                                      
      251 +    functionName: "milestoneFailed",                          
      252 +    args: id !== undefined ? [id] : undefined,                
      253 +    chainId,                                                  
      254 +    query: { enabled: !!address && id !== undefined, refetchIn
          +terval: 30_000 },                                             
      255 +  });                                                         
      256 +  return { ...q, failed: (q.data as boolean | undefined) ?? fa
          +lse };                                                        
      257 +}                                                             
      258 +                                                              
      259 +export type CovenantFn =                                      
      260 +  | "createCampaign"                                          
      261 +  | "donate"                                                  
      262 +  | "submitProof"                                             
      263 +  | "reviewProof"                                             
      264 +  | "cancelCampaign"                                          
      265 +  | "failCampaign"                                            
      266 +  | "claimRefund";                                            
      267 +                                                              
      268  export function useCovenantWrite() {
      269    const { address, abi, chainId, writeEnabled } = useReadChain
           ();
      270    const connectedChainId = useChainId();

⏺ Skill(claude-api)
  ⎿  Successfully loaded skill · 4 tools allowed

⏺ Write(lib/milestoneDrafter.ts)
  ⎿  Wrote 90 lines to lib/milestoneDrafter.ts
       1 import { ApprovalModel, CampaignKind } from "./types";
         pes";
       3 
       5  * AI-assisted milestone drafting — the typed boundary between t
         he create-flow
       7  *
       8  * The UI only ever talks to draftMilestones(); the generation i
       9  * behind POST /api/draft-milestones (app/api/draft-milestones/r
         oute.ts).
         kind; the LLM
     … +96 lines (ctrl+o to expand)

⏺ Write(app/api/draft-milestones/route.ts)
  ⎿  Wrote 236 lines to app/api/draft-milestones/route.ts
       1 import { NextResponse } from "next/server";
       2 import type {
       3   DraftRequest,
       4   DraftResponse,
       5   DraftedMilestone,
       7 import { defaultApprovalForKind } from "../../../lib/milestoneDr
         after";
       8 import { CampaignKind } from "../../../lib/types";
       9 
      10 /**
     … +285 lines (ctrl+o to expand)

⏺ Now the create-flow rebuild — milestone acceptance criteria, approval
  configuration with kind-based defaults, and the AI drafting entry point:

⏺ Write(app/create/page.tsx)
  ⎿  Added 507 lines, removed 270 lines
      1  "use client";
      2  
      3 -import { useEffect, useRef, useState } from "react";            
      3 +import { useRef, useState } from "react";                       
      4  import { useRouter } from "next/navigation";
      5 -import { parseUnits } from "viem";                              
      5 +import { isAddress, parseUnits } from "viem";                   
      6  import { useAccount } from "wagmi";
      7  import { ConnectButton } from "@rainbow-me/rainbowkit";
      8  import {
     ...
      15  import { TxFeedback } from "../../components/TxFeedback";
      16  import { ContractNotice } from "../../components/ContractNotice
          ";
      17  import { USDC_DECIMALS, formatUsdc } from "../../lib/format";
      18 +import {                                                       
      19 +  ApprovalModel,                                               
      20 +  CampaignKind,                                                
      21 +  type ApprovalModelValue,                                     
      22 +  type CampaignKindValue,                                      
      23 +} from "../../lib/types";                                      
      24 +import { defaultApprovalForKind, draftMilestones } from "../../
         +lib/milestoneDrafter";                                         
      25  
      19 -const MIN_MILESTONES = 3;                                      
      20 -// Must match Covenant.sol MAX_MILESTONES — the contract revert
         -s above this.                                                  
      26 +// Must match Covenant.sol constants — the contract is the enfo
         +rcer.                                                          
      27  const MAX_MILESTONES = 5;
      28 +const MAX_REVIEWERS = 7;                                       
      29 +const FREE_CAMPAIGNS = 2;                                      
      30 +const CREATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;              
      31  
      23 -const DEMO = {                                                 
      24 -  title: "Community Medical Relief Fund",                      
      25 -  description:                                                 
      26 -    "A transparent emergency fundraiser where donations unlock 
         -in equal tranches. Each withdrawal requires on-chain proof of h
         -ow the previous funds were used.",                             
      27 -  mode: "even" as "even" | "manual",                           
      28 -  totalGoal: "0.5",                                            
      29 -  milestoneCount: 3,                                           
      30 -  descriptions: [                                              
      31 -    "Hospital deposit — receipt posted on-chain",              
      32 -    "Medication purchase — purchase proof submitted",          
      33 -    "Follow-up appointment — confirmation uploaded",           
      34 -  ],                                                           
      35 -  amounts: ["", "", ""],                                       
      36 -};                                                             
      32 +interface MilestoneForm {                                      
      33 +  title: string;                                               
      34 +  amount: string; // USDC display units                        
      35 +  successDefinition: string;                                   
      36 +  reportingPeriod: string;                                     
      37 +  expectedMetrics: string;                                     
      38 +  requiredProof: string;                                       
      39 +  deadline: string; // yyyy-mm-dd, "" = none                   
      40 +}                                                              
      41  
      42 +const emptyMilestone = (): MilestoneForm => ({                 
      43 +  title: "",                                                   
      44 +  amount: "",                                                  
      45 +  successDefinition: "",                                       
      46 +  reportingPeriod: "",                                         
      47 +  expectedMetrics: "",                                         
      48 +  requiredProof: "",                                           
      49 +  deadline: "",                                                
      50 +});                                                            
      51 +                                                               
      52 +const KIND_OPTIONS: Array<{ value: CampaignKindValue; label: st
         +ring; hint: string }> = [                                      
      53 +  { value: CampaignKind.Charity, label: "Charity / community", 
         +hint: "receipts, photos, delivery proof" },                    
      54 +  { value: CampaignKind.Startup, label: "Startup / VC", hint: "
         +metrics, analytics, investor review" },                        
      55 +  { value: CampaignKind.Grant, label: "Grant program", hint: "d
         +eliverables, administrator sign-off" },                        
      56 +  { value: CampaignKind.Other, label: "Other", hint: "" },     
      57 +];                                                             
      58 +                                                               
      59  function safeParse(amount: string): bigint | null {
      60    try {
      61      return amount ? parseUnits(amount, USDC_DECIMALS) : null;
     ...
      64    }
      65  }
      66  
      46 -// Mirrors Covenant.sol's anti-spam constants (FREE_CAMPAIGNS, 
         -CREATION_COOLDOWN).                                            
      47 -const FREE_CAMPAIGNS = 2;                                      
      48 -const CREATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;              
      67 +function deadlineToUnix(date: string): bigint {                
      68 +  if (!date) return 0n;                                        
      69 +  // End of the chosen day, local time — a deadline "on July 20
         +" means July 20 counts.                                        
      70 +  const ts = new Date(`${date}T23:59:59`).getTime();           
      71 +  return Number.isNaN(ts) ? 0n : BigInt(Math.floor(ts / 1000));
      72 +}                                                              
      73  
      74  export default function CreateCampaignPage() {
      75    const router = useRouter();
     ...
      77    const { writeEnabled } = useReadChain();
      78    const { count } = useCampaignCount();
      79    const predictedId = useRef<bigint | null>(null);
      80 +  const confirmedOnce = useRef(false);                         
      81  
      82    // Pre-check the on-chain creation limits so users get a clea
          r message
      83    // instead of a wallet revert. The contract is the actual enf
          orcer.
     ...
       93  
       94    const [title, setTitle] = useState("");
       95    const [description, setDescription] = useState("");
       71 -  const [mode, setMode] = useState<"even" | "manual">("even");
       96 +  const [kind, setKind] = useState<CampaignKindValue>(Campaign
          +Kind.Charity);                                                
       97 +  const [milestones, setMilestones] = useState<MilestoneForm[]
          +>([                                                           
       98 +    emptyMilestone(),                                         
       99 +    emptyMilestone(),                                         
      100 +    emptyMilestone(),                                         
      101 +  ]);                                                         
      102 +  const [expanded, setExpanded] = useState<number | null>(0); 
      103  
       73 -  // Even split state                                         
      104 +  // Approval configuration                                   
      105 +  const [approvalModel, setApprovalModel] = useState<ApprovalM
          +odelValue>(                                                   
      106 +    defaultApprovalForKind(CampaignKind.Charity).model,       
      107 +  );                                                          
      108 +  const [approvalTouched, setApprovalTouched] = useState(false
          +);                                                            
      109 +  const [reviewers, setReviewers] = useState<string[]>([""]); 
      110 +  const [threshold, setThreshold] = useState(1);              
      111 +                                                              
      112 +  // AI drafting state                                        
      113 +  const [drafting, setDrafting] = useState(false);            
      114 +  const [draftNote, setDraftNote] = useState<string | null>(nu
          +ll);                                                          
      115    const [totalGoal, setTotalGoal] = useState("");
       75 -  const [milestoneCount, setMilestoneCount] = useState(3);    
      116  
       77 -  // Shared: per-milestone descriptions + manual amounts      
       78 -  const [descriptions, setDescriptions] = useState<string[]>([
          -"", "", ""]);                                                 
       79 -  const [amounts, setAmounts] = useState<string[]>(["", "", ""
          -]);                                                           
       80 -                                                              
      117    const { execute, refresh, isPending, isConfirming, isConfirm
           ed, error, hash } =
      118      useCovenantWrite();
      119  
       84 -  // Keep descriptions + amounts arrays in sync with milestone
          -Count (even mode)                                             
       85 -  useEffect(() => {                                           
       86 -    if (mode !== "even") return;                              
       87 -    setDescriptions((prev) => {                               
       88 -      if (prev.length === milestoneCount) return prev;        
       89 -      return prev.length < milestoneCount                     
       90 -        ? [...prev, ...Array(milestoneCount - prev.length).fil
          -l("")]                                                        
       91 -        : prev.slice(0, milestoneCount);                      
       92 -    });                                                       
       93 -    setAmounts((prev) => {                                    
       94 -      if (prev.length === milestoneCount) return prev;        
       95 -      return prev.length < milestoneCount                     
       96 -        ? [...prev, ...Array(milestoneCount - prev.length).fil
          -l("")]                                                        
       97 -        : prev.slice(0, milestoneCount);                      
       98 -    });                                                       
       99 -  }, [milestoneCount, mode]);                                 
      120 +  if (isConfirmed && predictedId.current !== null && !confirme
          +dOnce.current) {                                              
      121 +    confirmedOnce.current = true;                             
      122 +    refresh();                                                
      123 +    router.push(`/campaigns/${predictedId.current.toString()}`
          +);                                                            
      124 +  }                                                           
      125  
      101 -  useEffect(() => {                                           
      102 -    if (isConfirmed && predictedId.current !== null) {        
      103 -      refresh();                                              
      104 -      router.push(`/campaigns/${predictedId.current.toString()
          -}`);                                                          
      126 +  const selectKind = (next: CampaignKindValue) => {           
      127 +    setKind(next);                                            
      128 +    // Smart default: only move the approval model if the user
          + hasn't chosen one.                                           
      129 +    if (!approvalTouched) {                                   
      130 +      setApprovalModel(defaultApprovalForKind(next).model);   
      131      }
      106 -    // eslint-disable-next-line react-hooks/exhaustive-deps   
      107 -  }, [isConfirmed]);                                          
      132 +  };                                                          
      133  
      109 -  // Derived values                                           
      110 -  const parsedGoal = safeParse(totalGoal);                    
      111 -  const amountEach = parsedGoal && milestoneCount > 0 ? parsed
          -Goal / BigInt(milestoneCount) : null;                         
      134 +  const patchMilestone = (i: number, patch: Partial<MilestoneF
          +orm>) => {                                                    
      135 +    setMilestones((prev) => prev.map((m, idx) => (idx === i ? 
          +{ ...m, ...patch } : m)));                                    
      136 +  };                                                          
      137  
      113 -  // In manual mode, compute totalGoal from sum of amounts    
      114 -  const parsedAmounts = amounts.map(safeParse);               
      115 -  const manualTotal =                                         
      116 -    mode === "manual" && parsedAmounts.every((a) => a !== null
          - && a > 0n)                                                   
      117 -      ? parsedAmounts.reduce((s, a) => s! + a!, 0n as bigint) 
      118 -      : null;                                                 
      138 +  const addMilestone = () => {                                
      139 +    setMilestones((prev) => [...prev, emptyMilestone()]);     
      140 +    setExpanded(milestones.length);                           
      141 +  };                                                          
      142  
      120 -  // Per-milestone amounts array to pass to contract          
      121 -  const finalAmounts: bigint[] | null = (() => {              
      122 -    if (mode === "even") {                                    
      123 -      if (!amountEach || !parsedGoal) return null;            
      124 -      const n = milestoneCount;                               
      125 -      return Array.from({ length: n }, (_, i) =>              
      126 -        i === n - 1 ? parsedGoal - amountEach * BigInt(n - 1) 
          -: amountEach,                                                 
      143 +  const removeMilestone = (i: number) => {                    
      144 +    setMilestones((prev) => prev.filter((_, idx) => idx !== i)
          +);                                                            
      145 +    setExpanded(null);                                        
      146 +  };                                                          
      147 +                                                              
      148 +  const splitEvenly = () => {                                 
      149 +    const parsed = safeParse(totalGoal);                      
      150 +    if (!parsed || parsed <= 0n || milestones.length === 0) re
          +turn;                                                         
      151 +    const n = BigInt(milestones.length);                      
      152 +    const each = parsed / n;                                  
      153 +    const last = parsed - each * (n - 1n);                    
      154 +    setMilestones((prev) =>                                   
      155 +      prev.map((m, i) => ({                                   
      156 +        ...m,                                                 
      157 +        amount: formatUsdc(i === prev.length - 1 ? last : each
          +),                                                            
      158 +      })),                                                    
      159 +    );                                                        
      160 +  };                                                          
      161 +                                                              
      162 +  const runDraft = async () => {                              
      163 +    if (!title.trim() || !description.trim()) return;         
      164 +    setDrafting(true);                                        
      165 +    setDraftNote(null);                                       
      166 +    try {                                                     
      167 +      const draft = await draftMilestones({                   
      168 +        kind,                                                 
      169 +        title: title.trim(),                                  
      170 +        description: description.trim(),                      
      171 +        goalAmount: totalGoal || undefined,                   
      172 +        milestoneCount: milestones.length,                    
      173 +      });                                                     
      174 +      const goal = safeParse(totalGoal);                      
      175 +      setMilestones(                                          
      176 +        draft.milestones.map((m) => {                         
      177 +          const deadline = new Date(Date.now() + m.suggestedDe
          +adlineDays * 86_400_000);                                     
      178 +          const share =                                       
      179 +            goal && goal > 0n                                 
      180 +              ? formatUsdc(BigInt(Math.floor(Number(goal) * m.
          +amountShare)))                                                
      181 +              : "";                                           
      182 +          return {                                            
      183 +            title: m.title,                                   
      184 +            amount: share,                                    
      185 +            successDefinition: m.successDefinition,           
      186 +            reportingPeriod: m.reportingPeriod,               
      187 +            expectedMetrics: m.expectedMetrics,               
      188 +            requiredProof: m.requiredProof,                   
      189 +            deadline: m.suggestedDeadlineDays > 0 ? deadline.t
          +oISOString().slice(0, 10) : "",                               
      190 +          };                                                  
      191 +        }),                                                   
      192        );
      128 -    } else {                                                  
      129 -      if (parsedAmounts.some((a) => a === null || a <= 0n)) re
          -turn null;                                                    
      130 -      return parsedAmounts as bigint[];                       
      193 +      if (!approvalTouched) {                                 
      194 +        setApprovalModel(draft.approval.model);               
      195 +        setThreshold(draft.approval.threshold);               
      196 +      }                                                       
      197 +      setDraftNote(                                           
      198 +        `${draft.source === "llm" ? "AI draft" : "Template dra
          +ft"} loaded — every field below is a suggestion. Edit until it
          + matches what you actually committed to. ${draft.notes}`,     
      199 +      );                                                      
      200 +      setExpanded(0);                                         
      201 +    } catch {                                                 
      202 +      setDraftNote("Drafting failed — fill the milestones in m
          +anually.");                                                   
      203 +    } finally {                                               
      204 +      setDrafting(false);                                     
      205      }
      132 -  })();                                                       
      206 +  };                                                          
      207  
      134 -  const titleValid = title.trim().length > 0;                 
      135 -  const descValid = description.trim().length > 0;            
      136 -  const goalValid = mode === "even" ? (parsedGoal !== null && 
          -parsedGoal > 0n) : manualTotal !== null;                      
      137 -  const descsValid = descriptions.every((d) => d.trim().length
          - > 0);                                                        
      138 -  const formValid = titleValid && descValid && goalValid && de
          -scsValid && finalAmounts !== null;                            
      208 +  // ---------------------------------------------------------
          +------------------                                            
      209 +  // Validation                                               
      210 +  // ---------------------------------------------------------
          +------------------                                            
      211 +  const parsedAmounts = milestones.map((m) => safeParse(m.amou
          +nt));                                                         
      212 +  const goalTotal = parsedAmounts.every((a) => a !== null && a
          + > 0n)                                                        
      213 +    ? parsedAmounts.reduce((s, a) => s! + a!, 0n as bigint)   
      214 +    : null;                                                   
      215  
      216 +  const milestoneErrors = milestones.map((m, i) => {          
      217 +    if (!m.title.trim()) return "needs a title";              
      218 +    if (!m.successDefinition.trim()) return "needs a success d
          +efinition";                                                   
      219 +    const a = parsedAmounts[i];                               
      220 +    if (a === null || a <= 0n) return "needs a USDC amount";  
      221 +    if (m.deadline && deadlineToUnix(m.deadline) <= BigInt(Mat
          +h.floor(Date.now() / 1000)))                                  
      222 +      return "deadline must be in the future";                
      223 +    return null;                                              
      224 +  });                                                         
      225 +                                                              
      226 +  const needsReviewers = approvalModel === ApprovalModel.Desig
          +natedReviewers;                                               
      227 +  const cleanReviewers = reviewers.map((r) => r.trim()).filter
          +((r) => r.length > 0);                                        
      228 +  const reviewerError = !needsReviewers                       
      229 +    ? null                                                    
      230 +    : cleanReviewers.length === 0                             
      231 +      ? "Add at least one reviewer address"                   
      232 +      : cleanReviewers.some((r) => !isAddress(r))             
      233 +        ? "One of the reviewer addresses is not a valid addres
          +s"                                                            
      234 +        : address && cleanReviewers.some((r) => r.toLowerCase(
          +) === address.toLowerCase())                                  
      235 +          ? "You cannot review your own campaign"             
      236 +          : new Set(cleanReviewers.map((r) => r.toLowerCase())
          +).size !== cleanReviewers.length                              
      237 +            ? "Duplicate reviewer address"                    
      238 +            : cleanReviewers.length > MAX_REVIEWERS           
      239 +              ? `At most ${MAX_REVIEWERS} reviewers`          
      240 +              : threshold < 1 || threshold > cleanReviewers.le
          +ngth                                                          
      241 +                ? "Approval threshold must be between 1 and th
          +e number of reviewers"                                        
      242 +                : null;                                       
      243 +                                                              
      244 +  const formValid =                                           
      245 +    title.trim().length > 0 &&                                
      246 +    description.trim().length > 0 &&                          
      247 +    milestones.length >= 1 &&                                 
      248 +    milestones.length <= MAX_MILESTONES &&                    
      249 +    milestoneErrors.every((e) => e === null) &&               
      250 +    reviewerError === null;                                   
      251 +                                                              
      252    const submit = async () => {
      141 -    if (!formValid || !finalAmounts) return;                  
      253 +    if (!formValid) return;                                   
      254      predictedId.current = count;
      255      try {
      256        await execute("createCampaign", [
      257          title.trim(),
      258          description.trim(),
      147 -        descriptions.map((d) => d.trim()),                    
      148 -        finalAmounts,                                         
      259 +        kind,                                                 
      260 +        {                                                     
      261 +          model: approvalModel,                               
      262 +          reviewers: needsReviewers ? cleanReviewers : [],    
      263 +          threshold: needsReviewers ? threshold : 1,          
      264 +        },                                                    
      265 +        milestones.map((m, i) => ({                           
      266 +          criteria: {                                         
      267 +            title: m.title.trim(),                            
      268 +            successDefinition: m.successDefinition.trim(),    
      269 +            reportingPeriod: m.reportingPeriod.trim(),        
      270 +            expectedMetrics: m.expectedMetrics.trim(),        
      271 +            requiredProof: m.requiredProof.trim(),            
      272 +            proofDeadline: deadlineToUnix(m.deadline),        
      273 +          },                                                  
      274 +          amount: parsedAmounts[i]!,                          
      275 +        })),                                                  
      276        ]);
      277      } catch {
      278        /* surfaced via TxFeedback */
      279      }
      280    };
      281  
      155 -  const loadDemo = () => {                                    
      156 -    setTitle(DEMO.title);                                     
      157 -    setDescription(DEMO.description);                         
      158 -    setMode(DEMO.mode);                                       
      159 -    setTotalGoal(DEMO.totalGoal);                             
      160 -    setMilestoneCount(DEMO.milestoneCount);                   
      161 -    setDescriptions(DEMO.descriptions);                       
      162 -    setAmounts(DEMO.amounts);                                 
      163 -  };                                                          
      164 -                                                              
      165 -  const addMilestone = () => {                                
      166 -    setDescriptions((prev) => [...prev, ""]);                 
      167 -    setAmounts((prev) => [...prev, ""]);                      
      168 -  };                                                          
      169 -                                                              
      170 -  const removeMilestone = (i: number) => {                    
      171 -    setDescriptions((prev) => prev.filter((_, idx) => idx !== 
          -i));                                                          
      172 -    setAmounts((prev) => prev.filter((_, idx) => idx !== i)); 
      173 -  };                                                          
      174 -                                                              
      175 -  // Cumulative thresholds for display                        
      176 -  const cumulativeTargets: string[] = (() => {                
      177 -    if (mode === "even") {                                    
      178 -      return descriptions.map((_, i) => {                     
      179 -        if (!amountEach) return "?";                          
      180 -        const n = milestoneCount;                             
      181 -        const cum = i === n - 1                               
      182 -          ? parsedGoal! - amountEach * BigInt(n - 1) + amountE
          -ach * BigInt(i)                                               
      183 -          : amountEach * BigInt(i + 1);                       
      184 -        return formatUsdc(cum);                               
      185 -      });                                                     
      186 -    } else {                                                  
      187 -      let running = 0n;                                       
      188 -      return parsedAmounts.map((a) => {                       
      189 -        if (a === null) return "?";                           
      190 -        running += a;                                         
      191 -        return formatUsdc(running);                           
      192 -      });                                                     
      193 -    }                                                         
      194 -  })();                                                       
      195 -                                                              
      282    return (
      283      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      198 -      <div className="mb-6 flex items-center justify-between">
      199 -        <div>                                                 
      200 -          <h1 className="text-2xl font-bold text-[var(--text-p
          -rimary)]">Create a campaign</h1>                              
      201 -          <p className="mt-1 text-sm text-[var(--text-secondar
          -y)]">                                                         
      202 -            Set milestone amounts — funds unlock in tranches a
          -s each milestone is proven.                                   
      203 -          </p>                                                
      204 -        </div>                                                
      205 -        <button type="button" className="btn-ghost text-xs" on
          -Click={loadDemo}>                                             
      206 -          Use demo campaign                                   
      207 -        </button>                                             
      284 +      <div className="mb-6">                                  
      285 +        <h1 className="text-2xl font-bold text-[var(--text-pri
          +mary)]">Create a campaign</h1>                                
      286 +        <p className="mt-1 text-sm text-[var(--text-secondary)
          +]">                                                           
      287 +          Funds unlock in tranches — each milestone releases o
          +nly after your reviewers approve the                          
      288 +          proof against the acceptance criteria you set here. 
      289 +        </p>                                                  
      290        </div>
      291  
      292        <div className="mb-6">
      293          <ContractNotice />
      294        </div>
      295  
      214 -      <div className="card space-y-5 p-6">                    
      215 -        {!writeEnabled && (                                   
      216 -          <p className="rounded-xl bg-[var(--bg-subtle)] px-4 
          -py-3 text-sm text-[var(--text-secondary)]">                   
      217 -            Campaign creation is only enabled on USDC-compatib
          -le Covenant deployments. The current                          
      218 -            Base Mainnet contract is still the older ETH versi
          -on, so this form stays read-only until                        
      219 -            the USDC contract is redeployed and exported to th
          -e frontend.                                                   
      220 -          </p>                                                
      221 -        )}                                                    
      296 +      <div className="card space-y-6 p-6">                    
      297 +        {/* Campaign kind */}                                 
      298 +        <div>                                                 
      299 +          <label className="label">Campaign type</label>      
      300 +          <div className="grid gap-2 sm:grid-cols-4">         
      301 +            {KIND_OPTIONS.map((opt) => (                      
      302 +              <button                                         
      303 +                key={opt.value}                               
      304 +                type="button"                                 
      305 +                onClick={() => selectKind(opt.value)}         
      306 +                className={`rounded-xl border px-3 py-2 text-l
          +eft text-sm transition ${                                     
      307 +                  kind === opt.value                          
      308 +                    ? "border-[var(--brand-primary)]/60 bg-[va
          +r(--brand-primary)]/10 text-[var(--brand-primary)]"           
      309 +                    : "border-[var(--border-primary)] bg-[var(
          +--bg-faint)] text-[var(--text-secondary)] hover:text-[var(--te
          +xt-primary)]"                                                 
      310 +                }`}                                           
      311 +              >                                               
      312 +                <span className="block font-medium">{opt.label
          +}</span>                                                      
      313 +                {opt.hint && <span className="block text-xs op
          +acity-70">{opt.hint}</span>}                                  
      314 +              </button>                                       
      315 +            ))}                                               
      316 +          </div>                                              
      317 +        </div>                                                
      318  
      223 -        {/* Title */}                                         
      319 +        {/* Title + description */}                           
      320          <div>
      321            <label className="label">Title</label>
      322            <input
      323              className="input"
      228 -            placeholder="Community Medical Relief Fund"       
      324 +            placeholder={                                     
      325 +              kind === CampaignKind.Startup ? "Acme — seed mil
          +estone tranche" : "Community Medical Relief Fund"             
      326 +            }                                                 
      327              value={title}
      328              onChange={(e) => setTitle(e.target.value)}
      329            />
      330          </div>
      233 -                                                              
      234 -        {/* Description */}                                   
      331          <div>
      236 -          <label className="label">Description</label>        
      332 +          <label className="label">What is this campaign for?<
          +/label>                                                       
      333            <textarea
      334              className="input min-h-[90px] resize-y"
      239 -            placeholder="What is this fundraiser for, and how 
          -will milestones prove progress?"                              
      335 +            placeholder="Describe the goal. The milestone draf
          +ter uses this to suggest acceptance criteria."                
      336              value={description}
      337              onChange={(e) => setDescription(e.target.value)}
      338            />
      339          </div>
      340  
      245 -        {/* Mode toggle */}                                   
      246 -        <div>                                                 
      247 -          <label className="label">Milestone amounts</label>  
      248 -          <div className="flex gap-2">                        
      341 +        {/* Goal + drafting */}                               
      342 +        <div className="rounded-xl border border-[var(--border
          +-primary)] bg-[var(--bg-faint)] p-4">                         
      343 +          <div className="flex flex-wrap items-end gap-3">    
      344 +            <div className="flex-1">                          
      345 +              <label className="label">Total goal (USDC, optio
          +nal here)</label>                                             
      346 +              <input                                          
      347 +                className="input font-mono"                   
      348 +                inputMode="decimal"                           
      349 +                placeholder="e.g. 0.5"                        
      350 +                value={totalGoal}                             
      351 +                onChange={(e) => setTotalGoal(e.target.value.r
          +eplace(/[^0-9.]/g, ""))}                                      
      352 +              />                                              
      353 +            </div>                                            
      354              <button
      355                type="button"
      251 -              className={`flex-1 rounded-xl border px-4 py-2 t
          -ext-sm font-medium transition ${                              
      252 -                mode === "even"                               
      253 -                  ? "border-[var(--brand-primary)]/60 bg-[var(
          ---brand-primary)]/10 text-[var(--brand-primary)]"             
      254 -                  : "border-[var(--border-primary)] bg-[var(--
          -bg-faint)] text-[var(--text-secondary)] hover:text-[var(--text
          --primary)]"                                                   
      255 -              }`}                                             
      256 -              onClick={() => setMode("even")}                 
      356 +              className="btn-secondary"                       
      357 +              onClick={splitEvenly}                           
      358 +              disabled={!safeParse(totalGoal)}                
      359 +              title="Split the goal evenly across the mileston
          +es below"                                                     
      360              >
      258 -              Even split                                      
      361 +              Split evenly                                    
      362              </button>
      363              <button
      364                type="button"
      262 -              className={`flex-1 rounded-xl border px-4 py-2 t
          -ext-sm font-medium transition ${                              
      263 -                mode === "manual"                             
      264 -                  ? "border-[var(--brand-primary)]/60 bg-[var(
          ---brand-primary)]/10 text-[var(--brand-primary)]"             
      265 -                  : "border-[var(--border-primary)] bg-[var(--
          -bg-faint)] text-[var(--text-secondary)] hover:text-[var(--text
          --primary)]"                                                   
      266 -              }`}                                             
      267 -              onClick={() => {                                
      268 -                setMode("manual");                            
      269 -                // migrate descriptions length into manual mod
          -e                                                             
      270 -                setAmounts(Array(descriptions.length).fill("")
          -);                                                            
      271 -              }}                                              
      365 +              className="btn-primary"                         
      366 +              onClick={runDraft}                              
      367 +              disabled={drafting || !title.trim() || !descript
          +ion.trim()}                                                   
      368              >
      273 -              Set manually                                    
      369 +              {drafting ? "Drafting…" : "✦ Draft milestones fo
          +r me"}                                                        
      370              </button>
      371            </div>
      372 +          <p className="mt-2 text-xs text-[var(--text-tertiary
          +)]">                                                          
      373 +            The drafter proposes acceptance criteria, proof re
          +quirements, reporting cadence,                                
      374 +            deadlines and an approval setup based on your camp
          +aign type. It&apos;s an assistant, not                        
      375 +            the final authority — you review and edit everythi
          +ng before it goes on-chain.                                   
      376 +          </p>                                                
      377 +          {draftNote && (                                     
      378 +            <p className="mt-2 rounded-lg bg-[var(--brand-prim
          +ary)]/10 px-3 py-2 text-xs text-[var(--brand-primary)]">      
      379 +              {draftNote}                                     
      380 +            </p>                                              
      381 +          )}                                                  
      382          </div>
      383  
      278 -        {/* Even split controls */}                           
      279 -        {mode === "even" && (                                 
      280 -          <div className="grid gap-4 sm:grid-cols-2">         
      281 -            <div>                                             
      282 -              <label className="label">Total goal (USDC)</labe
          -l>                                                            
      283 -              <input                                          
      284 -                className="input font-mono"                   
      285 -                inputMode="decimal"                           
      286 -                placeholder="e.g. 0.10"                       
      287 -                value={totalGoal}                             
      288 -                onChange={(e) => setTotalGoal(e.target.value.r
          -eplace(/[^0-9.]/g, ""))}                                      
      289 -              />                                              
      290 -            </div>                                            
      291 -            <div>                                             
      292 -              <label className="label">Number of milestones</l
          -abel>                                                         
      293 -              <select                                         
      294 -                className="input"                             
      295 -                value={milestoneCount}                        
      296 -                onChange={(e) => setMilestoneCount(Number(e.ta
          -rget.value))}                                                 
      297 -              >                                               
      298 -                {Array.from({ length: MAX_MILESTONES - MIN_MIL
          -ESTONES + 1 }, (_, i) => i + MIN_MILESTONES).map((n) => (     
      299 -                  <option key={n} value={n}>                  
      300 -                    {n} milestones                            
      301 -                  </option>                                   
      302 -                ))}                                           
      303 -              </select>                                       
      304 -            </div>                                            
      384 +        {/* Milestones */}                                    
      385 +        <div>                                                 
      386 +          <div className="flex items-center justify-between"> 
      387 +            <label className="label">Milestones &amp; acceptan
          +ce criteria</label>                                           
      388 +            {goalTotal !== null && (                          
      389 +              <span className="font-mono text-sm text-[var(--t
          +ext-secondary)]">                                             
      390 +                goal: {formatUsdc(goalTotal)} USDC            
      391 +              </span>                                         
      392 +            )}                                                
      393            </div>
      306 -        )}                                                    
      394 +          <p className="mb-3 text-xs text-[var(--text-tertiary
          +)]">                                                          
      395 +            Evidence can stay flexible; the criteria can&apos;
          +t stay vague. Each milestone should                           
      396 +            state what &ldquo;done&rdquo; means so your review
          +ers know exactly what they&apos;re                            
      397 +            evaluating.                                       
      398 +          </p>                                                
      399  
      308 -        {/* Even split preview */}                            
      309 -        {mode === "even" && amountEach !== null && amountEach 
          -> 0n && (                                                     
      310 -          <div className="flex items-center justify-between ro
          -unded-xl bg-[var(--bg-faint)] px-4 py-3">                     
      311 -            <span className="text-sm text-[var(--text-secondar
          -y)]">Each milestone unlocks</span>                            
      312 -            <span className="font-mono text-lg font-semibold t
          -ext-[var(--brand-primary)]">                                  
      313 -              {formatUsdc(amountEach)} USDC                   
      314 -            </span>                                           
      315 -          </div>                                              
      316 -        )}                                                    
      400 +          <div className="space-y-3">                         
      401 +            {milestones.map((m, i) => {                       
      402 +              const isOpen = expanded === i;                  
      403 +              const err = milestoneErrors[i];                 
      404 +              return (                                        
      405 +                <div                                          
      406 +                  key={i}                                     
      407 +                  className={`rounded-xl border p-4 ${        
      408 +                    err && (m.title || m.successDefinition || 
          +m.amount)                                                     
      409 +                      ? "border-amber-600/40"                 
      410 +                      : "border-[var(--border-primary)]"      
      411 +                  }`}                                         
      412 +                >                                             
      413 +                  <div className="flex items-center gap-2">   
      414 +                    <span className="flex h-7 w-7 shrink-0 ite
          +ms-center justify-center rounded-full bg-[var(--bg-subtle)] te
          +xt-xs font-bold text-[var(--text-secondary)]">                
      415 +                      {i + 1}                                 
      416 +                    </span>                                   
      417 +                    <input                                    
      418 +                      className="input flex-1"                
      419 +                      placeholder={`Milestone ${i + 1} title (
          +e.g. "500 weekly active users")`}                             
      420 +                      value={m.title}                         
      421 +                      onChange={(e) => patchMilestone(i, { tit
          +le: e.target.value })}                                        
      422 +                    />                                        
      423 +                    <input                                    
      424 +                      className="input w-28 font-mono"        
      425 +                      inputMode="decimal"                     
      426 +                      placeholder="USDC"                      
      427 +                      value={m.amount}                        
      428 +                      onChange={(e) =>                        
      429 +                        patchMilestone(i, { amount: e.target.v
          +alue.replace(/[^0-9.]/g, "") })                               
      430 +                      }                                       
      431 +                    />                                        
      432 +                    <button                                   
      433 +                      type="button"                           
      434 +                      className="btn-ghost shrink-0 px-2 text-
          +xs"                                                           
      435 +                      onClick={() => setExpanded(isOpen ? null
          + : i)}                                                        
      436 +                    >                                         
      437 +                      {isOpen ? "▴ criteria" : "▾ criteria"}  
      438 +                    </button>                                 
      439 +                    {milestones.length > 1 && (               
      440 +                      <button                                 
      441 +                        type="button"                         
      442 +                        className="shrink-0 text-[var(--text-t
          +ertiary)] hover:text-red-600"                                 
      443 +                        onClick={() => removeMilestone(i)}    
      444 +                        title="Remove milestone"              
      445 +                      >                                       
      446 +                        ✕                                     
      447 +                      </button>                               
      448 +                    )}                                        
      449 +                  </div>                                      
      450  
      318 -        {/* Manual total preview */}                          
      319 -        {mode === "manual" && manualTotal !== null && (       
      320 -          <div className="flex items-center justify-between ro
          -unded-xl bg-[var(--bg-faint)] px-4 py-3">                     
      321 -            <span className="text-sm text-[var(--text-secondar
          -y)]">Total goal</span>                                        
      322 -            <span className="font-mono text-lg font-semibold t
          -ext-[var(--brand-primary)]">                                  
      323 -              {formatUsdc(manualTotal)} USDC                  
      324 -            </span>                                           
      451 +                  {isOpen && (                                
      452 +                    <div className="mt-3 space-y-3 border-t bo
          +rder-[var(--border-primary)] pt-3">                           
      453 +                      <div>                                   
      454 +                        <label className="label">Success defin
          +ition (required)</label>                                      
      455 +                        <textarea                             
      456 +                          className="input min-h-[60px] resize
          +-y"                                                           
      457 +                          placeholder='What does "done" mean, 
          +concretely? A stranger should be able to judge it.'           
      458 +                          value={m.successDefinition}         
      459 +                          onChange={(e) => patchMilestone(i, {
          + successDefinition: e.target.value })}                        
      460 +                        />                                    
      461 +                      </div>                                  
      462 +                      <div>                                   
      463 +                        <label className="label">Required proo
          +f / documents</label>                                         
      464 +                        <input                                
      465 +                          className="input"                   
      466 +                          placeholder="e.g. analytics screensh
          +ots, receipts, delivery logs"                                 
      467 +                          value={m.requiredProof}             
      468 +                          onChange={(e) => patchMilestone(i, {
          + requiredProof: e.target.value })}                            
      469 +                        />                                    
      470 +                      </div>                                  
      471 +                      <div className="grid gap-3 sm:grid-cols-
          +2">                                                           
      472 +                        <div>                                 
      473 +                          <label className="label">Expected me
          +trics (optional)</label>                                      
      474 +                          <input                              
      475 +                            className="input"                 
      476 +                            placeholder="e.g. WAU ≥ 500, reten
          +tion ≥ 20%"                                                   
      477 +                            value={m.expectedMetrics}         
      478 +                            onChange={(e) => patchMilestone(i,
          + { expectedMetrics: e.target.value })}                        
      479 +                          />                                  
      480 +                        </div>                                
      481 +                        <div>                                 
      482 +                          <label className="label">Reporting p
          +eriod (optional)</label>                                      
      483 +                          <input                              
      484 +                            className="input"                 
      485 +                            placeholder="e.g. every 2 weeks"  
      486 +                            value={m.reportingPeriod}         
      487 +                            onChange={(e) => patchMilestone(i,
          + { reportingPeriod: e.target.value })}                        
      488 +                          />                                  
      489 +                        </div>                                
      490 +                      </div>                                  
      491 +                      <div>                                   
      492 +                        <label className="label">Proof deadlin
          +e (recommended)</label>                                       
      493 +                        <input                                
      494 +                          type="date"                         
      495 +                          className="input"                   
      496 +                          value={m.deadline}                  
      497 +                          onChange={(e) => patchMilestone(i, {
          + deadline: e.target.value })}                                 
      498 +                        />                                    
      499 +                        <p className="mt-1 text-xs text-[var(-
          +-text-tertiary)]">                                            
      500 +                          If proof isn&apos;t approved by the 
          +deadline, donors can recover their                            
      501 +                          unreleased funds. Without one, refun
          +ds only open on rejection timeouts or                         
      502 +                          if you cancel.                      
      503 +                        </p>                                  
      504 +                      </div>                                  
      505 +                    </div>                                    
      506 +                  )}                                          
      507 +                  {err && (m.title || m.successDefinition || m
          +.amount) && (                                                 
      508 +                    <p className="mt-2 text-xs text-amber-700"
          +>Milestone {i + 1} {err}.</p>                                 
      509 +                  )}                                          
      510 +                </div>                                        
      511 +              );                                              
      512 +            })}                                               
      513            </div>
      326 -        )}                                                    
      514 +          {milestones.length < MAX_MILESTONES && (            
      515 +            <button type="button" className="btn-ghost mt-3 te
          +xt-xs" onClick={addMilestone}>                                
      516 +              + Add milestone                                 
      517 +            </button>                                         
      518 +          )}                                                  
      519 +        </div>                                                
      520  
      328 -        {/* Milestone rows */}                                
      521 +        {/* Approval authority */}                            
      522          <div>
      330 -          <label className="label">Milestones</label>         
      523 +          <label className="label">Who approves milestone proo
          +f?</label>                                                    
      524            <p className="mb-3 text-xs text-[var(--text-tertiary
           )]">
      332 -            To unlock milestone N, the creator must first post
          - on-chain proof for milestone N−1.                            
      525 +            Funds only release when the approver(s) accept the
          + proof. Rejections send it back to                            
      526 +            you with notes.                                   
      527            </p>
      334 -          <div className="space-y-2">                         
      335 -            {descriptions.map((d, i) => (                     
      336 -              <div key={i} className="flex items-center gap-2"
          ->                                                             
      337 -                <div className="flex h-7 w-7 shrink-0 items-ce
          -nter justify-center rounded-full bg-[var(--bg-subtle)] text-xs
          - font-bold text-[var(--text-secondary)]">                     
      338 -                  {i + 1}                                     
      339 -                </div>                                        
      340 -                <input                                        
      341 -                  className="input flex-1"                    
      342 -                  placeholder={`What milestone ${i + 1} delive
          -rs`}                                                          
      343 -                  value={d}                                   
      344 -                  onChange={(e) => {                          
      345 -                    const next = [...descriptions];           
      346 -                    next[i] = e.target.value;                 
      347 -                    setDescriptions(next);                    
      348 -                  }}                                          
      349 -                />                                            
      350 -                {mode === "manual" && (                       
      528 +          <div className="grid gap-2 sm:grid-cols-3">         
      529 +            {(                                                
      530 +              [                                               
      531 +                {                                             
      532 +                  value: ApprovalModel.LeadDonor,             
      533 +                  label: "Lead donor",                        
      534 +                  hint: "largest donor reviews for everyone", 
      535 +                },                                            
      536 +                {                                             
      537 +                  value: ApprovalModel.DesignatedReviewers,   
      538 +                  label: "Designated reviewers",              
      539 +                  hint: "investors, committee, or grant admins
          + you name",                                                   
      540 +                },                                            
      541 +                {                                             
      542 +                  value: ApprovalModel.PlatformOperator,      
      543 +                  label: "Platform operator",                 
      544 +                  hint: "the Covenant platform reviews",      
      545 +                },                                            
      546 +              ] as const                                      
      547 +            ).map((opt) => (                                  
      548 +              <button                                         
      549 +                key={opt.value}                               
      550 +                type="button"                                 
      551 +                onClick={() => {                              
      552 +                  setApprovalModel(opt.value);                
      553 +                  setApprovalTouched(true);                   
      554 +                }}                                            
      555 +                className={`rounded-xl border px-3 py-2 text-l
          +eft text-sm transition ${                                     
      556 +                  approvalModel === opt.value                 
      557 +                    ? "border-[var(--brand-primary)]/60 bg-[va
          +r(--brand-primary)]/10 text-[var(--brand-primary)]"           
      558 +                    : "border-[var(--border-primary)] bg-[var(
          +--bg-faint)] text-[var(--text-secondary)] hover:text-[var(--te
          +xt-primary)]"                                                 
      559 +                }`}                                           
      560 +              >                                               
      561 +                <span className="block font-medium">{opt.label
          +}</span>                                                      
      562 +                <span className="block text-xs opacity-70">{op
          +t.hint}</span>                                                
      563 +              </button>                                       
      564 +            ))}                                               
      565 +          </div>                                              
      566 +          <p className="mt-2 text-xs text-[var(--text-tertiary
          +)]">                                                          
      567 +            {defaultApprovalForKind(kind).rationale} Donor-wid
          +e voting is scaffolded in the contract                        
      568 +            but not yet available.                            
      569 +          </p>                                                
      570 +                                                              
      571 +          {needsReviewers && (                                
      572 +            <div className="mt-4 space-y-2 rounded-xl border b
          +order-[var(--border-primary)] bg-[var(--bg-faint)] p-4">      
      573 +              <label className="label">Reviewer wallet address
          +es</label>                                                    
      574 +              {reviewers.map((r, i) => (                      
      575 +                <div key={i} className="flex items-center gap-
          +2">                                                           
      576                    <input
      352 -                    className="input w-28 font-mono"          
      353 -                    inputMode="decimal"                       
      354 -                    placeholder="USDC"                        
      355 -                    value={amounts[i] ?? ""}                  
      356 -                    onChange={(e) => {                        
      357 -                      const next = [...amounts];              
      358 -                      next[i] = e.target.value.replace(/[^0-9.
          -]/g, "");                                                     
      359 -                      setAmounts(next);                       
      360 -                    }}                                        
      577 +                    className="input flex-1 font-mono text-sm"
      578 +                    placeholder="0x…"                         
      579 +                    value={r}                                 
      580 +                    onChange={(e) =>                          
      581 +                      setReviewers((prev) => prev.map((v, idx)
          + => (idx === i ? e.target.value : v)))                        
      582 +                    }                                         
      583                    />
      362 -                )}                                            
      363 -                <span className="w-24 shrink-0 text-right font
          --mono text-xs text-[var(--text-tertiary)]">                   
      364 -                  at {cumulativeTargets[i]} USDC              
      584 +                  {reviewers.length > 1 && (                  
      585 +                    <button                                   
      586 +                      type="button"                           
      587 +                      className="shrink-0 text-[var(--text-ter
          +tiary)] hover:text-red-600"                                   
      588 +                      onClick={() => setReviewers((prev) => pr
          +ev.filter((_, idx) => idx !== i))}                            
      589 +                    >                                         
      590 +                      ✕                                       
      591 +                    </button>                                 
      592 +                  )}                                          
      593 +                </div>                                        
      594 +              ))}                                             
      595 +              {reviewers.length < MAX_REVIEWERS && (          
      596 +                <button                                       
      597 +                  type="button"                               
      598 +                  className="btn-ghost text-xs"               
      599 +                  onClick={() => setReviewers((prev) => [...pr
          +ev, ""])}                                                     
      600 +                >                                             
      601 +                  + Add reviewer                              
      602 +                </button>                                     
      603 +              )}                                              
      604 +              <div className="flex items-center gap-3 pt-2">  
      605 +                <label className="label mb-0">Approvals requir
          +ed to release</label>                                         
      606 +                <select                                       
      607 +                  className="input w-24"                      
      608 +                  value={threshold}                           
      609 +                  onChange={(e) => setThreshold(Number(e.targe
          +t.value))}                                                    
      610 +                >                                             
      611 +                  {Array.from({ length: Math.max(cleanReviewer
          +s.length, 1) }, (_, i) => i + 1).map(                         
      612 +                    (n) => (                                  
      613 +                      <option key={n} value={n}>              
      614 +                        {n}                                   
      615 +                      </option>                               
      616 +                    ),                                        
      617 +                  )}                                          
      618 +                </select>                                     
      619 +                <span className="text-xs text-[var(--text-tert
          +iary)]">                                                      
      620 +                  of {cleanReviewers.length || "?"} reviewer{c
          +leanReviewers.length === 1 ? "" : "s"}                        
      621 +                  {threshold > 1 ? " (committee)" : ""}       
      622                  </span>
      366 -                {mode === "manual" && descriptions.length > MI
          -N_MILESTONES && (                                             
      367 -                  <button                                     
      368 -                    type="button"                             
      369 -                    className="shrink-0 text-[var(--text-terti
          -ary)] hover:text-[var(--text-danger)]"                        
      370 -                    onClick={() => removeMilestone(i)}        
      371 -                    title="Remove milestone"                  
      372 -                  >                                           
      373 -                    ✕                                         
      374 -                  </button>                                   
      375 -                )}                                            
      623                </div>
      377 -            ))}                                               
      378 -          </div>                                              
      379 -          {mode === "manual" && descriptions.length < MAX_MILE
          -STONES && (                                                   
      380 -            <button                                           
      381 -              type="button"                                   
      382 -              className="btn-ghost mt-3 text-xs"              
      383 -              onClick={addMilestone}                          
      384 -            >                                                 
      385 -              + Add milestone                                 
      386 -            </button>                                         
      624 +              {reviewerError && <p className="text-xs text-amb
          +er-700">{reviewerError}</p>}                                  
      625 +            </div>                                            
      626            )}
      627          </div>
      628  
     ...
      674            />
      675          </div>
      676  
      438 -        {!formValid &&                                        
      439 -          (title || description || totalGoal || descriptions.s
          -ome((d) => d)) && (                                           
      440 -            <p className="text-xs text-[var(--text-tertiary)]"
          ->                                                             
      441 -              Provide a title, description,{" "}              
      442 -              {mode === "even" ? "total goal and milestone cou
          -nt" : "a USDC amount for every milestone"},{" "}              
      443 -              and a description for every milestone.          
      444 -            </p>                                              
      445 -          )}                                                  
      677 +        {!formValid && (title || description || milestones.som
          +e((m) => m.title)) && (                                       
      678 +          <p className="text-xs text-[var(--text-tertiary)]"> 
      679 +            Every milestone needs a title, a success definitio
          +n and a USDC amount                                           
      680 +            {needsReviewers ? ", and reviewer addresses must b
          +e valid" : ""}.                                               
      681 +          </p>                                                
      682 +        )}                                                    
      683        </div>
      684      </div>
      685    );
⏺ Write(components/EvidencePanel.tsx)
  ⎿  Added 433 lines, removed 197 lines
       2  
       3  import { useEffect, useState } from "react";
       4  import type { Campaign, Milestone } from "../lib/types";
       5 -import { useCovenantWrite, useReadChain } from "../hooks/useCov
         -enant";                                                        
       5 +import { MilestoneState } from "../lib/types";                 
       6 +import {                                                       
       7 +  useApprovalConfig,                                           
       8 +  useCovenantWrite,                                            
       9 +  useReadChain,                                                
      10 +  useReviews,                                                  
      11 +  useSubmissions,                                              
      12 +} from "../hooks/useCovenant";                                 
      13  import { TxFeedback } from "./TxFeedback";
       7 -import { EvidenceLink } from "./EvidenceLink";                 
      14 +import { formatDeadline } from "../lib/format";                
      15 +import {                                                       
      16 +  hashManifest,                                                
      17 +  manifestToDataUri,                                           
      18 +  canonicalManifestJson,                                       
      19 +  type ProofManifest,                                          
      20 +} from "../lib/proofManifest";                                 
      21 +import { storeManifest } from "../lib/evidenceRegistry";       
      22  
      23  type SocialPlatform = "linkedin" | "farcaster";
      24  
      25  const SOCIAL: Record<
      26    SocialPlatform,
      13 -  { name: string; composeUrl: (text: string) => string; example
         -: string }                                                     
      27 +  { name: string; composeUrl: (text: string) => string }       
      28  > = {
      29    linkedin: {
      30      name: "LinkedIn",
      31      composeUrl: (text) =>
      32        `https://www.linkedin.com/feed/?shareActive=true&text=${e
          ncodeURIComponent(text)}`,
      19 -    example: `Hey everyone, I’m [name], and I’m currently build
         -ing a startup called [startup name].                           
      20 -                                                               
      21 -We’re raising [amount] to help us [explain the goal]. We’re cur
         -rently working on [describe current progress and plans].       
      22 -                                                               
      23 -We’d love for you to try the application through our waitlist a
         -nd share your honest feedback. Our goal is to build the best po
         -ssible product for people experiencing [problem].`,            
      33    },
      34    farcaster: {
      35      name: "Farcaster",
      36      composeUrl: (text) => `https://warpcast.com/~/compose?text=
          ${encodeURIComponent(text)}`,
      28 -    example: `gm! quick update from [startup name] — we just sh
         -ipped [what you accomplished] \u{1F680}                        
      29 -                                                               
      30 -we’re raising [amount] to [explain the goal]. try it, roast it,
         - share it — all feedback welcome!`,                            
      37    },
      38  };
      39  
     ...
      46    }
      47  }
      48  
      49 +/**                                                            
      50 + * Proof-package submission panel (creator side).              
      51 + *                                                             
      52 + * Submitting proof does NOT release funds — reviewers evaluate
         + the package                                                   
      53 + * against the milestone's acceptance criteria and approve or r
         +equest changes.                                                
      54 + * On-chain we store the package's hash + a short public summar
         +y; the full                                                    
      55 + * package (narrative, justification, metrics, links) is publis
         +hed on-chain                                                   
      56 + * only if the creator opts in, otherwise it stays off-chain.  
      57 + */                                                            
      58  export function EvidencePanel({
      59    campaign,
      60    milestones,
     ...
       66    isCreator: boolean;
       67    onSuccess?: () => void;
       68  }) {
       54 -  const [progress, setProgress] = useState("");               
       55 -  const [evidenceUrl, setEvidenceUrl] = useState("");         
       56 -  const [activeTab, setActiveTab] = useState<SocialPlatform>("
          -linkedin");                                                   
       57 -  const [messages, setMessages] = useState<Record<SocialPlatfo
          -rm, string>>({                                                
       58 -    linkedin: "",                                             
       59 -    farcaster: "",                                            
       60 -  });                                                         
       61 -  const [copied, setCopied] = useState<SocialPlatform | null>(
          -null);                                                        
       62 -  // window.location is unavailable during prerender, so resol
          -ve it after mount.                                            
       63 -  const [origin, setOrigin] = useState("");                   
       69 +  const mi = Math.min(Number(campaign.currentMilestone), Math.
          +max(milestones.length - 1, 0));                               
       70 +  const milestone: Milestone | undefined = milestones[mi];    
       71 +                                                              
       72    const { writeEnabled } = useReadChain();
       73 +  const { config } = useApprovalConfig(campaign.id);          
       74 +  const { reviews } = useReviews(campaign.id, mi);            
       75 +  const { submissions } = useSubmissions(campaign.id, mi);    
       76    const { execute, refresh, isPending, isConfirming, isConfirm
           ed, error, hash } =
       77      useCovenantWrite();
       78  
       68 -  useEffect(() => {                                           
       69 -    setOrigin(window.location.origin);                        
       70 -  }, []);                                                     
       79 +  // Proof package form state                                 
       80 +  const [summary, setSummary] = useState("");                 
       81 +  const [narrative, setNarrative] = useState("");             
       82 +  const [justification, setJustification] = useState("");     
       83 +  const [reportingNotes, setReportingNotes] = useState("");   
       84 +  const [metricsSummary, setMetricsSummary] = useState("");   
       85 +  const [links, setLinks] = useState<Array<{ url: string; labe
          +l: string }>>([                                               
       86 +    { url: "", label: "" },                                   
       87 +  ]);                                                         
       88 +  const [publicEvidence, setPublicEvidence] = useState(true); 
       89 +  const [lastManifest, setLastManifest] = useState<ProofManife
          +st | null>(null);                                             
       90  
       91 +  // Social sharing (kept deliberately separate — the post is 
          +NOT the proof record)                                         
       92 +  const [activeTab, setActiveTab] = useState<SocialPlatform>("
          +linkedin");                                                   
       93 +  const [postText, setPostText] = useState("");               
       94 +  const [copied, setCopied] = useState(false);                
       95 +  const [origin, setOrigin] = useState("");                   
       96 +  useEffect(() => setOrigin(window.location.origin), []);     
       97 +                                                              
       98    useEffect(() => {
       99      if (isConfirmed) {
       74 -      setProgress("");                                        
       75 -      setEvidenceUrl("");                                     
       76 -      setCopied(null);                                        
      100        refresh();
      101        onSuccess?.();
      102      }
      103      // eslint-disable-next-line react-hooks/exhaustive-deps
      104    }, [isConfirmed]);
      105  
       83 -  // A fresh edit invalidates the last copy, so hide the stale
          - confirmation.                                                
       84 -  useEffect(() => {                                           
       85 -    setCopied(null);                                          
       86 -  }, [messages, evidenceUrl]);                                
      106 +  if (!milestone) return null;                                
      107  
       88 -  // Evidence always targets the current active milestone. Sub
          -mitting evidence                                              
       89 -  // releases that milestone's funds in the same transaction (
          -once it's funded).                                            
       90 -  const current = Number(campaign.currentMilestone);          
       91 -  const evidenceIndex = campaign.completed                    
       92 -    ? milestones.length - 1                                   
       93 -    : Math.min(current, milestones.length - 1);               
      108 +  const state = milestone.state;                              
      109 +  const funded = campaign.totalRaised - campaign.totalReleased
          + >= milestone.amount;                                         
      110 +  const latestRejection = [...reviews].reverse().find((r) => !
          +r.approved);                                                  
      111 +  const threshold = config?.threshold ?? 1;                   
      112  
       95 -  const targetMilestone: Milestone | undefined = milestones[ev
          -idenceIndex];                                                 
      113 +  const filledLinks = links.filter((l) => l.url.trim().length 
          +> 0);                                                         
      114 +  const linksValid = filledLinks.length > 0 && filledLinks.eve
          +ry((l) => isValidUrl(l.url.trim()));                          
      115 +  const canSubmit =                                           
      116 +    summary.trim().length > 0 &&                              
      117 +    narrative.trim().length > 0 &&                            
      118 +    justification.trim().length > 0 &&                        
      119 +    linksValid;                                               
      120  
       97 -  const urlValid = isValidUrl(evidenceUrl.trim());            
       98 -  const canSubmit = progress.trim().length > 0 && urlValid;   
      121 +  const buildManifest = (): ProofManifest => ({               
      122 +    version: 1,                                               
      123 +    campaignId: campaign.id.toString(),                       
      124 +    milestoneIndex: mi,                                       
      125 +    narrative: narrative.trim(),                              
      126 +    justification: justification.trim(),                      
      127 +    reportingNotes: reportingNotes.trim(),                    
      128 +    metricsSummary: metricsSummary.trim(),                    
      129 +    links: filledLinks.map((l) => ({                          
      130 +      url: l.url.trim(),                                      
      131 +      ...(l.label.trim() ? { label: l.label.trim() } : {}),   
      132 +      kind: "url" as const,                                   
      133 +    })),                                                      
      134 +    createdAt: new Date().toISOString(),                      
      135 +  });                                                         
      136  
      100 -  const campaignLink = `${origin}/campaigns/${campaign.id.toSt
          -ring()}`;                                                     
      101 -                                                              
      102 -  // The final post is the creator's message verbatim, with on
          -ly the evidence                                               
      103 -  // and campaign links appended — Covenant never writes their
          - narrative.                                                   
      104 -  const buildPost = (platform: SocialPlatform) => {           
      105 -    const parts = [messages[platform].trim()];                
      106 -    if (evidenceUrl.trim()) parts.push(`Supporting evidence:\n
          -${evidenceUrl.trim()}`);                                      
      107 -    parts.push(`Follow this campaign on Covenant:\n${campaignL
          -ink}`);                                                       
      108 -    return parts.join("\n\n");                                
      109 -  };                                                          
      110 -                                                              
      111 -  const postTo = (platform: SocialPlatform) => {              
      112 -    const text = buildPost(platform);                         
      113 -    // Open synchronously so popup blockers see the click; cop
          -y in parallel.                                                
      114 -    navigator.clipboard?.writeText(text).catch(() => {});     
      115 -    window.open(SOCIAL[platform].composeUrl(text), "_blank", "
          -noopener,noreferrer");                                        
      116 -    setCopied(platform);                                      
      117 -  };                                                          
      118 -                                                              
      119 -  // Only the evidence URL goes on-chain; the description live
          -s in the social post.                                         
      137    const submit = async () => {
      138      if (!canSubmit) return;
      139 +    const manifest = buildManifest();                         
      140 +    const manifestHash = hashManifest(manifest);              
      141 +    const manifestURI = publicEvidence ? manifestToDataUri(man
          +ifest) : "";                                                  
      142 +    setLastManifest(manifest);                                
      143 +    // Best-effort off-chain registry copy (indexer + local) s
          +o reviewers can                                               
      144 +    // load the package by its on-chain hash even when it isn'
          +t published.                                                  
      145 +    void storeManifest(manifestHash, manifest);               
      146      try {
      123 -      await execute("submitEvidence", [campaign.id, evidenceUr
          -l.trim()]);                                                   
      147 +      await execute("submitProof", [campaign.id, summary.trim(
          +), manifestHash, manifestURI]);                               
      148      } catch {
      149        /* surfaced via TxFeedback */
      150      }
      151    };
      152  
      153 +  const downloadManifest = (manifest: ProofManifest) => {     
      154 +    const blob = new Blob([canonicalManifestJson(manifest)], {
          + type: "application/json" });                                 
      155 +    const url = URL.createObjectURL(blob);                    
      156 +    const a = document.createElement("a");                    
      157 +    a.href = url;                                             
      158 +    a.download = `proof-campaign${campaign.id}-milestone${mi +
          + 1}.json`;                                                    
      159 +    a.click();                                                
      160 +    URL.revokeObjectURL(url);                                 
      161 +  };                                                          
      162 +                                                              
      163 +  const campaignLink = `${origin}/campaigns/${campaign.id.toSt
          +ring()}`;                                                     
      164 +  const buildPost = () => {                                   
      165 +    const parts = [postText.trim()];                          
      166 +    parts.push(`Follow this campaign on Covenant:\n${campaignL
          +ink}`);                                                       
      167 +    return parts.join("\n\n");                                
      168 +  };                                                          
      169 +                                                              
      170 +  // ---------------------------------------------------------
          +------------------                                            
      171 +  // Status header (visible to everyone)                      
      172 +  // ---------------------------------------------------------
          +------------------                                            
      173 +  const statusBlock = campaign.completed ? (                  
      174 +    <p className="rounded-xl bg-[var(--bg-subtle)] px-4 py-3 t
          +ext-sm text-[var(--text-secondary)]">                         
      175 +      All milestones approved and released. 🎉                
      176 +    </p>                                                      
      177 +  ) : campaign.cancelledAt !== 0n ? (                         
      178 +    <p className="rounded-xl bg-red-600/10 px-4 py-3 text-sm t
          +ext-red-700">                                                 
      179 +      This campaign was cancelled. Donors can claim refunds of
          + the unreleased escrow.                                       
      180 +    </p>                                                      
      181 +  ) : state === MilestoneState.Submitted ? (                  
      182 +    <div className="rounded-xl bg-violet-600/10 px-4 py-3 text
          +-sm text-violet-700">                                         
      183 +      <p className="font-medium">                             
      184 +        Proof submitted — under review ({milestone.approvalCou
          +nt}/{threshold} approvals)                                    
      185 +      </p>                                                    
      186 +      <p className="mt-1 opacity-80">                         
      187 +        Funds stay locked until the reviewers approve this pac
          +kage against the milestone criteria.                          
      188 +      </p>                                                    
      189 +    </div>                                                    
      190 +  ) : state === MilestoneState.ChangesRequested ? (           
      191 +    <div className="rounded-xl bg-orange-600/10 px-4 py-3 text
          +-sm text-orange-700">                                         
      192 +      <p className="font-medium">Changes requested by a review
          +er</p>                                                        
      193 +      {latestRejection && (                                   
      194 +        <p className="mt-1 whitespace-pre-wrap">&ldquo;{latest
          +Rejection.notes}&rdquo;</p>                                   
      195 +      )}                                                      
      196 +      {milestone.revisionDeadline !== 0n && (                 
      197 +        <p className="mt-1 text-xs opacity-80">               
      198 +          Revise and resubmit by {formatDeadline(milestone.rev
          +isionDeadline)} — after that, donors                          
      199 +          can recover their funds.                            
      200 +        </p>                                                  
      201 +      )}                                                      
      202 +    </div>                                                    
      203 +  ) : (                                                       
      204 +    <p className="rounded-xl bg-[var(--bg-faint)] px-4 py-3 te
          +xt-sm text-[var(--text-secondary)]">                          
      205 +      {funded                                                 
      206 +        ? "This milestone is funded and waiting for the creato
          +r's proof package."                                           
      207 +        : "Waiting for donations to cover this milestone befor
          +e proof can be submitted."}                                   
      208 +      {milestone.criteria.proofDeadline !== 0n &&             
      209 +        ` Proof deadline: ${formatDeadline(milestone.criteria.
          +proofDeadline)}.`}                                            
      210 +    </p>                                                      
      211 +  );                                                          
      212 +                                                              
      213 +  const showForm =                                            
      214 +    isCreator &&                                              
      215 +    campaign.active &&                                        
      216 +    !campaign.completed &&                                    
      217 +    (state === MilestoneState.Pending || state === MilestoneSt
          +ate.ChangesRequested) &&                                      
      218 +    funded;                                                   
      219 +                                                              
      220    return (
      221      <div className="card p-5">
      222        <div className="mb-4 flex items-center justify-between">
      223          <h3 className="font-semibold text-[var(--text-primary)
           ]">
      133 -          {isCreator && targetMilestone ? "Submit proof" : "Mi
          -lestone proof"}                                               
      224 +          {isCreator ? "Submit proof package" : "Milestone pro
          +of"}                                                          
      225          </h3>
      135 -        {targetMilestone && (                                 
      136 -          <span className="pill bg-[var(--bg-subtle)] text-[va
          -r(--text-secondary)]">Milestone {evidenceIndex + 1}</span>    
      137 -        )}                                                    
      226 +        <span className="pill bg-[var(--bg-subtle)] text-[var(
          +--text-secondary)]">                                          
      227 +          Milestone {mi + 1}                                  
      228 +        </span>                                               
      229        </div>
      230  
      140 -      {campaign.completed ? (                                 
      141 -        <p className="rounded-xl bg-[var(--bg-subtle)] px-4 py
          --3 text-sm text-[var(--text-secondary)]">                     
      142 -          All milestones completed and proven. 🎉             
      143 -        </p>                                                  
      144 -      ) : targetMilestone?.evidenceSubmitted ? (              
      145 -        <div className="rounded-xl bg-[var(--bg-faint)] px-4 p
          -y-3">                                                         
      146 -          <p className="mb-1 text-xs uppercase tracking-wide t
          -ext-[var(--text-tertiary)]">                                  
      147 -            Proof for "{targetMilestone.description}"         
      231 +      {statusBlock}                                           
      232 +                                                              
      233 +      {/* Latest submission summary, for everyone */}         
      234 +      {submissions.length > 0 && (                            
      235 +        <div className="mt-3 rounded-xl bg-[var(--bg-faint)] p
          +x-4 py-3 text-sm">                                            
      236 +          <p className="text-xs uppercase tracking-wide text-[
          +var(--text-tertiary)]">                                       
      237 +            Latest submission (#{submissions.length})         
      238            </p>
      149 -          <EvidenceLink evidence={targetMilestone.evidence} />
      150 -          {/* If there's a more recent released-but-unproven m
          -ilestone, show a nudge */}                                    
      151 -          {current > 0 &&                                     
      152 -            milestones[current - 1]?.released &&              
      153 -            !milestones[current - 1]?.evidenceSubmitted &&    
      154 -            evidenceIndex !== current - 1 && (                
      155 -              <p className="mt-2 text-xs text-[var(--text-warn
          -ing)]">                                                       
      156 -                Milestone {current} needs proof to unlock the 
          -next tranche.                                                 
      157 -              </p>                                            
      158 -            )}                                                
      239 +          <p className="mt-1 text-[var(--text-primary)]">     
      240 +            {submissions[submissions.length - 1].summary}     
      241 +          </p>                                                
      242          </div>
      160 -      ) : (                                                   
      161 -        <p className="rounded-xl bg-[var(--bg-faint)] px-4 py-
          -3 text-sm text-[var(--text-secondary)]">                      
      162 -          No proof submitted yet for &ldquo;{targetMilestone?.
          -description}&rdquo;. Once the creator                         
      163 -          posts proof, funds are automatically released to the
          -m.                                                            
      164 -        </p>                                                  
      243        )}
      244  
      167 -      {isCreator && targetMilestone && (                      
      168 -        <div className="mt-4 border-t border-[var(--border-pri
          -mary)] pt-4">                                                 
      245 +      {isCreator && lastManifest && (                         
      246 +        <button                                               
      247 +          type="button"                                       
      248 +          className="btn-ghost mt-2 text-xs"                  
      249 +          onClick={() => downloadManifest(lastManifest)}      
      250 +        >                                                     
      251 +          ⬇ Download this proof package (JSON) — share it with
          + your reviewers if you kept it                                
      252 +          private                                             
      253 +        </button>                                             
      254 +      )}                                                      
      255 +                                                              
      256 +      {showForm && (                                          
      257 +        <div className="mt-4 space-y-3 border-t border-[var(--
          +border-primary)] pt-4">                                       
      258            {!writeEnabled && (
      170 -            <p className="mb-4 rounded-xl bg-[var(--bg-subtle)
          -] px-4 py-3 text-sm text-[var(--text-secondary)]">            
      171 -              Proof submission is disabled here until this net
          -work is upgraded to the USDC Covenant                         
      172 -              contract. The currently deployed Base Mainnet co
          -ntract is still legacy ETH-only.                              
      259 +            <p className="rounded-xl bg-[var(--bg-subtle)] px-
          +4 py-3 text-sm text-[var(--text-secondary)]">                 
      260 +              Proof submission is disabled until this network 
          +has a current Covenant deployment.                            
      261              </p>
      262            )}
      263  
      176 -          <label className="label">What did you accomplish?</l
          -abel>                                                         
      177 -          <textarea                                           
      178 -            className="input min-h-[90px] resize-y"           
      179 -            placeholder="Describe the progress you made on thi
          -s milestone"                                                  
      180 -            value={progress}                                  
      181 -            onChange={(e) => setProgress(e.target.value)}     
      182 -          />                                                  
      183 -                                                              
      184 -          <label className="label mt-3 block">Supporting evide
          -nce URL</label>                                               
      185 -          <input                                              
      186 -            className="input"                                 
      187 -            inputMode="url"                                   
      188 -            placeholder="https://… (receipt, photo, document)"
      189 -            value={evidenceUrl}                               
      190 -            onChange={(e) => setEvidenceUrl(e.target.value)}  
      191 -          />                                                  
      192 -          {evidenceUrl.trim() && !urlValid && (               
      193 -            <p className="mt-1 text-xs text-[var(--text-warnin
          -g)]">                                                         
      194 -              Enter a full URL starting with http:// or https:
          -//.                                                           
      264 +          {/* What the reviewer will evaluate */}             
      265 +          <div className="rounded-xl bg-[var(--bg-subtle)] px-
          +4 py-3 text-xs text-[var(--text-secondary)]">                 
      266 +            <p className="font-medium text-[var(--text-primary
          +)]">                                                          
      267 +              Reviewers will evaluate against:                
      268              </p>
      196 -          )}                                                  
      269 +            <p className="mt-1">{milestone.criteria.successDef
          +inition}</p>                                                  
      270 +            {milestone.criteria.requiredProof && (            
      271 +              <p className="mt-1">Required proof: {milestone.c
          +riteria.requiredProof}</p>                                    
      272 +            )}                                                
      273 +            {milestone.criteria.expectedMetrics && (          
      274 +              <p className="mt-1">Expected metrics: {milestone
          +.criteria.expectedMetrics}</p>                                
      275 +            )}                                                
      276 +          </div>                                              
      277  
      278 +          <div>                                               
      279 +            <label className="label">Public summary (goes on-c
          +hain)</label>                                                 
      280 +            <input                                            
      281 +              className="input"                               
      282 +              placeholder="One line, non-sensitive — e.g. 'Hos
          +pital deposit paid, receipt attached'"                        
      283 +              value={summary}                                 
      284 +              onChange={(e) => setSummary(e.target.value)}    
      285 +            />                                                
      286 +          </div>                                              
      287 +                                                              
      288 +          <div>                                               
      289 +            <label className="label">What did you accomplish?<
          +/label>                                                       
      290 +            <textarea                                         
      291 +              className="input min-h-[80px] resize-y"         
      292 +              placeholder="Your write-up. It doesn't have to b
          +e perfect proof — it helps reviewers understand the evidence."
      293 +              value={narrative}                               
      294 +              onChange={(e) => setNarrative(e.target.value)}  
      295 +            />                                                
      296 +          </div>                                              
      297 +                                                              
      298 +          <div>                                               
      299 +            <label className="label">How does the attached evi
          +dence show this?</label>                                      
      300 +            <textarea                                         
      301 +              className="input min-h-[60px] resize-y"         
      302 +              placeholder="Connect the links below to the mile
          +stone's success definition."                                  
      303 +              value={justification}                           
      304 +              onChange={(e) => setJustification(e.target.value
          +)}                                                            
      305 +            />                                                
      306 +          </div>                                              
      307 +                                                              
      308 +          <div className="grid gap-3 sm:grid-cols-2">         
      309 +            <div>                                             
      310 +              <label className="label">Metrics summary (option
          +al)</label>                                                   
      311 +              <input                                          
      312 +                className="input"                             
      313 +                placeholder="e.g. WAU 540, W4 retention 22%"  
      314 +                value={metricsSummary}                        
      315 +                onChange={(e) => setMetricsSummary(e.target.va
          +lue)}                                                         
      316 +              />                                              
      317 +            </div>                                            
      318 +            <div>                                             
      319 +              <label className="label">Dates / reporting notes
          + (optional)</label>                                           
      320 +              <input                                          
      321 +                className="input"                             
      322 +                placeholder="e.g. covers June 1–28 reporting p
          +eriod"                                                        
      323 +                value={reportingNotes}                        
      324 +                onChange={(e) => setReportingNotes(e.target.va
          +lue)}                                                         
      325 +              />                                              
      326 +            </div>                                            
      327 +          </div>                                              
      328 +                                                              
      329 +          {/* Evidence links — one or more */}                
      330 +          <div>                                               
      331 +            <label className="label">Supporting evidence links
          +</label>                                                      
      332 +            <div className="space-y-2">                       
      333 +              {links.map((l, i) => (                          
      334 +                <div key={i} className="flex items-center gap-
          +2">                                                           
      335 +                  <input                                      
      336 +                    className="input flex-1"                  
      337 +                    inputMode="url"                           
      338 +                    placeholder="https://… (dashboard, receipt
          +, photo, doc, video)"                                         
      339 +                    value={l.url}                             
      340 +                    onChange={(e) =>                          
      341 +                      setLinks((prev) =>                      
      342 +                        prev.map((v, idx) => (idx === i ? { ..
          +.v, url: e.target.value } : v)),                              
      343 +                      )                                       
      344 +                    }                                         
      345 +                  />                                          
      346 +                  <input                                      
      347 +                    className="input w-36"                    
      348 +                    placeholder="label (optional)"            
      349 +                    value={l.label}                           
      350 +                    onChange={(e) =>                          
      351 +                      setLinks((prev) =>                      
      352 +                        prev.map((v, idx) => (idx === i ? { ..
          +.v, label: e.target.value } : v)),                            
      353 +                      )                                       
      354 +                    }                                         
      355 +                  />                                          
      356 +                  {links.length > 1 && (                      
      357 +                    <button                                   
      358 +                      type="button"                           
      359 +                      className="shrink-0 text-[var(--text-ter
          +tiary)] hover:text-red-600"                                   
      360 +                      onClick={() => setLinks((prev) => prev.f
          +ilter((_, idx) => idx !== i))}                                
      361 +                    >                                         
      362 +                      ✕                                       
      363 +                    </button>                                 
      364 +                  )}                                          
      365 +                </div>                                        
      366 +              ))}                                             
      367 +            </div>                                            
      368 +            <button                                           
      369 +              type="button"                                   
      370 +              className="btn-ghost mt-2 text-xs"              
      371 +              onClick={() => setLinks((prev) => [...prev, { ur
          +l: "", label: "" }])}                                         
      372 +            >                                                 
      373 +              + Add evidence link                             
      374 +            </button>                                         
      375 +            {filledLinks.length > 0 && !linksValid && (       
      376 +              <p className="mt-1 text-xs text-amber-700">     
      377 +                Every link must be a full URL starting with ht
          +tp:// or https://.                                            
      378 +              </p>                                            
      379 +            )}                                                
      380 +          </div>                                              
      381 +                                                              
      382 +          {/* Privacy boundary */}                            
      383 +          <div className="rounded-xl border border-[var(--bord
          +er-primary)] p-3">                                            
      384 +            <label className="flex cursor-pointer items-start 
          +gap-2 text-sm">                                               
      385 +              <input                                          
      386 +                type="checkbox"                               
      387 +                className="mt-0.5"                            
      388 +                checked={publicEvidence}                      
      389 +                onChange={(e) => setPublicEvidence(e.target.ch
          +ecked)}                                                       
      390 +              />                                              
      391 +              <span>                                          
      392 +                <span className="font-medium text-[var(--text-
          +primary)]">                                                   
      393 +                  Publish the full package on-chain           
      394 +                </span>                                       
      395 +                <span className="mt-0.5 block text-xs text-[va
          +r(--text-secondary)]">                                        
      396 +                  {publicEvidence                             
      397 +                    ? "The whole package (write-up + links) be
          +comes permanently public. Fine for charity receipts; uncheck f
          +or sensitive financials or customer data."                    
      398 +                    : "Only the one-line summary and a fingerp
          +rint (hash) of the package go on-chain. The full package is st
          +ored off-chain for your reviewers; download it after submittin
          +g to share directly if needed."}                              
      399 +                </span>                                       
      400 +              </span>                                         
      401 +            </label>                                          
      402 +          </div>                                              
      403 +                                                              
      404            <button
      199 -            className="btn-primary mt-4 w-full"               
      405 +            className="btn-primary w-full"                    
      406              onClick={submit}
      407              disabled={!writeEnabled || !canSubmit || isPending
            || isConfirming}
      408            >
      203 -            {!writeEnabled                                    
      204 -              ? "USDC deployment required"                    
      205 -              : isPending || isConfirming                     
      409 +            {isPending || isConfirming                        
      410                ? "Submitting…"
      207 -              : !canSubmit                                    
      208 -                ? "Add a description and evidence URL"        
      209 -                : "Post proof on-chain"}                      
      411 +              : state === MilestoneState.ChangesRequested     
      412 +                ? "Resubmit revised proof for review"         
      413 +                : "Submit proof for review"}                  
      414            </button>
      211 -          <div className="mt-3 min-h-[1.25rem]">              
      415 +          <div className="min-h-[1.25rem]">                   
      416              <TxFeedback
      417                isPending={isPending}
      418                isConfirming={isConfirming}
      419                isConfirmed={isConfirmed}
      420                error={error}
      421                hash={hash}
      218 -              successText="Proof recorded on-chain."          
      422 +              successText="Proof package submitted — awaiting 
          +reviewer approval. Funds release only after approval."        
      423              />
      424            </div>
      221 -          <p className="mt-1 text-xs text-[var(--text-tertiary
          -)]">                                                          
      222 -            The evidence URL is stored permanently on-chain. S
          -ubmitting proof automatically releases                        
      223 -            this milestone&apos;s funds to you.               
      425 +          <p className="text-xs text-[var(--text-tertiary)]"> 
      426 +            On-chain record: your public summary, the package 
          +fingerprint                                                   
      427 +            {publicEvidence ? ", and the full package contents
          +" : " (contents stay off-chain)"}.                            
      428 +            Submitting does not release funds.                
      429            </p>
      430 +        </div>                                                
      431 +      )}                                                      
      432  
      226 -          {/* ------------------------------------------------
          -------------- */}                                             
      227 -          {/* Share an update — the creator writes the post in
          - their own    */}                                             
      228 -          {/* words; Covenant only appends the evidence + camp
          -aign links.   */}                                             
      229 -          {/* ------------------------------------------------
          -------------- */}                                             
      230 -          <div className="mt-4 border-t border-[var(--border-p
          -rimary)] pt-4">                                               
      231 -            <p className="label">Share an update</p>          
      433 +      {/* Creator: cancel escape hatch */}                    
      434 +      {isCreator && campaign.active && !campaign.completed && 
          +(                                                             
      435 +        <CancelSection campaignId={campaign.id} />            
      436 +      )}                                                      
      437  
      233 -            <div className="mb-3 flex gap-2">                 
      234 -              {(Object.keys(SOCIAL) as SocialPlatform[]).map((
          -platform) => (                                                
      235 -                <button                                       
      236 -                  key={platform}                              
      237 -                  type="button"                               
      238 -                  onClick={() => setActiveTab(platform)}      
      239 -                  className={`flex-1 rounded-xl border px-4 py
          --2 text-sm font-medium transition ${                          
      240 -                    activeTab === platform                    
      241 -                      ? "border-[var(--brand-primary)]/60 bg-[
          -var(--brand-primary)]/10 text-[var(--brand-primary)]"         
      242 -                      : "border-[var(--border-primary)] bg-[va
          -r(--bg-faint)] text-[var(--text-secondary)] hover:text-[var(--
          -text-primary)]"                                               
      243 -                  }`}                                         
      244 -                >                                             
      245 -                  {SOCIAL[platform].name}                     
      246 -                </button>                                     
      247 -              ))}                                             
      248 -            </div>                                            
      249 -                                                              
      250 -            <textarea                                         
      251 -              className="input min-h-[110px] resize-y"        
      252 -              placeholder={`Write your ${SOCIAL[activeTab].nam
          -e} post in your own words`}                                   
      253 -              value={messages[activeTab]}                     
      254 -              onChange={(e) =>                                
      255 -                setMessages((prev) => ({ ...prev, [activeTab]:
          - e.target.value }))                                           
      256 -              }                                               
      257 -            />                                                
      258 -                                                              
      259 -            <details className="mt-2">                        
      260 -              <summary className="cursor-pointer text-xs font-
          -medium text-[var(--text-secondary)] hover:text-[var(--text-pri
          -mary)]">                                                      
      261 -                View example post                             
      262 -              </summary>                                      
      263 -              <div className="mt-2 rounded-xl bg-[var(--bg-sub
          -tle)] px-4 py-3">                                             
      264 -                <p className="whitespace-pre-wrap text-xs text
          --[var(--text-tertiary)]">                                     
      265 -                  {SOCIAL[activeTab].example}                 
      266 -                </p>                                          
      267 -                <p className="mt-2 text-xs italic text-[var(--
          -text-tertiary)]">                                             
      268 -                  For inspiration only — this text is never ad
          -ded to your post.                                             
      269 -                </p>                                          
      270 -              </div>                                          
      271 -            </details>                                        
      272 -                                                              
      273 -            {messages[activeTab].trim() && (                  
      274 -              <>                                              
      275 -                <p className="label mt-3">Final preview</p>   
      276 -                <div className="rounded-xl bg-[var(--bg-faint)
          -] px-4 py-3">                                                 
      277 -                  <p className="whitespace-pre-wrap break-word
          -s text-sm text-[var(--text-secondary)]">                      
      278 -                    {buildPost(activeTab)}                    
      279 -                  </p>                                        
      280 -                </div>                                        
      281 -              </>                                             
      282 -            )}                                                
      283 -                                                              
      284 -            <button                                           
      285 -              type="button"                                   
      286 -              className="btn-secondary mt-3 w-full"           
      287 -              onClick={() => postTo(activeTab)}               
      288 -              disabled={!messages[activeTab].trim()}          
      289 -            >                                                 
      290 -              Post on {SOCIAL[activeTab].name}                
      291 -            </button>                                         
      292 -                                                              
      293 -            {copied && (                                      
      294 -              <p className="mt-2 rounded-xl bg-[var(--brand-pr
          -imary)]/10 px-4 py-2 text-xs text-[var(--brand-primary)]">    
      295 -                Copied to clipboard — {SOCIAL[copied].name} op
          -ened in a new tab. Paste there to                             
      296 -                publish.                                      
      297 -              </p>                                            
      298 -            )}                                                
      438 +      {/* Social sharing — optional, explicitly not the proof 
          +record */}                                                    
      439 +      {isCreator && campaign.active && (                      
      440 +        <div className="mt-4 border-t border-[var(--border-pri
          +mary)] pt-4">                                                 
      441 +          <p className="label">Share an update (optional)</p> 
      442 +          <p className="mb-2 text-xs text-[var(--text-tertiary
          +)]">                                                          
      443 +            This post is marketing, not evidence — nothing her
          +e is recorded on-chain or shown to                            
      444 +            reviewers.                                        
      445 +          </p>                                                
      446 +          <div className="mb-3 flex gap-2">                   
      447 +            {(Object.keys(SOCIAL) as SocialPlatform[]).map((pl
          +atform) => (                                                  
      448 +              <button                                         
      449 +                key={platform}                                
      450 +                type="button"                                 
      451 +                onClick={() => setActiveTab(platform)}        
      452 +                className={`flex-1 rounded-xl border px-4 py-2
          + text-sm font-medium transition ${                            
      453 +                  activeTab === platform                      
      454 +                    ? "border-[var(--brand-primary)]/60 bg-[va
          +r(--brand-primary)]/10 text-[var(--brand-primary)]"           
      455 +                    : "border-[var(--border-primary)] bg-[var(
          +--bg-faint)] text-[var(--text-secondary)] hover:text-[var(--te
          +xt-primary)]"                                                 
      456 +                }`}                                           
      457 +              >                                               
      458 +                {SOCIAL[platform].name}                       
      459 +              </button>                                       
      460 +            ))}                                               
      461            </div>
      462 +          <textarea                                           
      463 +            className="input min-h-[90px] resize-y"           
      464 +            placeholder={`Write your ${SOCIAL[activeTab].name}
          + post in your own words`}                                     
      465 +            value={postText}                                  
      466 +            onChange={(e) => {                                
      467 +              setPostText(e.target.value);                    
      468 +              setCopied(false);                               
      469 +            }}                                                
      470 +          />                                                  
      471 +          <button                                             
      472 +            type="button"                                     
      473 +            className="btn-secondary mt-3 w-full"             
      474 +            onClick={() => {                                  
      475 +              const text = buildPost();                       
      476 +              navigator.clipboard?.writeText(text).catch(() =>
          + {});                                                         
      477 +              window.open(SOCIAL[activeTab].composeUrl(text), 
          +"_blank", "noopener,noreferrer");                             
      478 +              setCopied(true);                                
      479 +            }}                                                
      480 +            disabled={!postText.trim()}                       
      481 +          >                                                   
      482 +            Post on {SOCIAL[activeTab].name}                  
      483 +          </button>                                           
      484 +          {copied && (                                        
      485 +            <p className="mt-2 rounded-xl bg-[var(--brand-prim
          +ary)]/10 px-4 py-2 text-xs text-[var(--brand-primary)]">      
      486 +              Copied to clipboard — {SOCIAL[activeTab].name} o
          +pened in a new tab.                                           
      487 +            </p>                                              
      488 +          )}                                                  
      489          </div>
      490        )}
      491      </div>
      492    );
      493  }
      494 +                                                              
      495 +function CancelSection({ campaignId }: { campaignId: bigint })
          + {                                                            
      496 +  const [armed, setArmed] = useState(false);                  
      497 +  const { execute, refresh, isPending, isConfirming, isConfirm
          +ed, error, hash } =                                           
      498 +    useCovenantWrite();                                       
      499 +                                                              
      500 +  useEffect(() => {                                           
      501 +    if (isConfirmed) refresh();                               
      502 +    // eslint-disable-next-line react-hooks/exhaustive-deps   
      503 +  }, [isConfirmed]);                                          
      504 +                                                              
      505 +  return (                                                    
      506 +    <details className="mt-4 border-t border-[var(--border-pri
          +mary)] pt-3">                                                 
      507 +      <summary className="cursor-pointer text-xs text-[var(--t
          +ext-tertiary)] hover:text-red-600">                           
      508 +        Cancel this campaign…                                 
      509 +      </summary>                                              
      510 +      <div className="mt-2 rounded-xl bg-red-600/5 p-3 text-xs
          + text-[var(--text-secondary)]">                               
      511 +        <p>                                                   
      512 +          Cancelling permanently closes the campaign and lets 
          +every donor reclaim their share of                            
      513 +          the unreleased escrow. Funds already released for ap
          +proved milestones are not affected.                           
      514 +        </p>                                                  
      515 +        <label className="mt-2 flex items-center gap-2">      
      516 +          <input type="checkbox" checked={armed} onChange={(e)
          + => setArmed(e.target.checked)} />                            
      517 +          I understand this cannot be undone                  
      518 +        </label>                                              
      519 +        <button                                               
      520 +          type="button"                                       
      521 +          className="btn-secondary mt-2 w-full text-red-700"  
      522 +          disabled={!armed || isPending || isConfirming}      
      523 +          onClick={() => execute("cancelCampaign", [campaignId
          +]).catch(() => {})}                                           
      524 +        >                                                     
      525 +          {isPending || isConfirming ? "Cancelling…" : "Cancel
          + campaign & open refunds"}                                    
      526 +        </button>                                             
      527 +        <div className="min-h-[1.25rem]">                     
      528 +          <TxFeedback                                         
      529 +            isPending={isPending}                             
      530 +            isConfirming={isConfirming}                       
      531 +            isConfirmed={isConfirmed}                         
      532 +            error={error}                                     
      533 +            hash={hash}                                       
      534 +            successText="Campaign cancelled — donors can now c
          +laim refunds."                                                
      535 +          />                                                  
      536 +        </div>                                                
      537 +      </div>                                                  
      538 +    </details>                                                
      539 +  );                                                          
      540 +}                                                             

⏺ Now the reviewer workflow UI — a new ReviewPanel component:

⏺ Write(components/ReviewPanel.tsx)
  ⎿  Wrote 358 lines to components/ReviewPanel.tsx
       1 "use client";
       2 
       3 import { useEffect, useState } from "react";
       5 import { useQuery } from "@tanstack/react-query";
       6 import type { Campaign, Milestone, ProofSubmission } from "../li
         b/types";
       7 import { APPROVAL_MODEL_LABELS, MilestoneState } from "../lib/ty
         pes";
       9   useApprovalConfig,
      10   useCovenantWrite,
     … +426 lines (ctrl+o to expand)

⏺ Now wiring into the campaign page and updating the remaining shape-dependent
  components. Let me see the rest of DonationPanel:

  Read 1 file (ctrl+o to expand)

⏺ Update(components/DonationPanel.tsx)
  ⎿  Added 1 line, removed 1 line
       6  import { ConnectButton } from "@rainbow-me/rainbowkit";
       7  import type { Campaign } from "../lib/types";
       8  import { USDC_DECIMALS, formatUsdc } from "../lib/format";
       9 -import { useCovenantWrite, useReadChain, useUsdc } from "../hoo
         -ks/useCovenant";                                               
       9 +import { useCovenantWrite, useReadChain, useRefund, useUsdc } f
         +rom "../hooks/useCovenant";                                    
      10  import { TxFeedback } from "./TxFeedback";
      11  
      12  // Safe demo values from PRD §9 — tiny real-USDC amounts.

⏺ Update(components/DonationPanel.tsx)
  ⎿  Added 2 lines
      122            older ETH contract. Redeploy the USDC contract on th
           is network before accepting new
      123            donations.
      124          </p>
      125 +      ) : campaign.cancelledAt !== 0n ? (                     
      126 +        <RefundSection campaign={campaign} account={account} /
          +>                                                             
      127        ) : !campaign.active ? (
      128          <p className="rounded-xl bg-[var(--bg-subtle)] px-4 py
           -3 text-sm text-[var(--text-secondary)]">
      129            This campaign is {campaign.completed ? "completed" :
            "closed"} and no longer accepting

⏺ Update(components/DonationPanel.tsx)
  ⎿  Added 63 lines, removed 1 line
      225  
      226            <p className="mt-2 text-xs text-[var(--text-tertiary
           )]">
      227              Funds are held by the Covenant contract and only r
           eleased to the creator milestone by
      228 -            milestone, once each milestone is funded and its o
          -n-chain proof is posted.                                      
      228 +            milestone, after the campaign&apos;s reviewers app
          +rove each proof package. If the                               
      229 +            creator misses a proof deadline, you can reclaim y
          +our share of the unreleased escrow.                           
      230            </p>
      231          </>
      232        )}
      233      </div>
      234    );
      235  }
      236 +                                                              
      237 +/** Shown once a campaign is cancelled/failed: donors reclaim 
          +pro-rata escrow. */                                           
      238 +function RefundSection({                                      
      239 +  campaign,                                                   
      240 +  account,                                                    
      241 +}: {                                                          
      242 +  campaign: Campaign;                                         
      243 +  account?: `0x${string}`;                                    
      244 +}) {                                                          
      245 +  const { refund, refetch } = useRefund(campaign.id, account);
      246 +  const { execute, refresh, isPending, isConfirming, isConfirm
          +ed, error, hash } =                                           
      247 +    useCovenantWrite();                                       
      248 +                                                              
      249 +  useEffect(() => {                                           
      250 +    if (isConfirmed) {                                        
      251 +      refetch();                                              
      252 +      refresh();                                              
      253 +    }                                                         
      254 +    // eslint-disable-next-line react-hooks/exhaustive-deps   
      255 +  }, [isConfirmed]);                                          
      256 +                                                              
      257 +  return (                                                    
      258 +    <div className="rounded-xl bg-red-600/5 px-4 py-3 text-sm"
          +>                                                             
      259 +      <p className="font-medium text-red-700">                
      260 +        This campaign was cancelled — refunds are open.       
      261 +      </p>                                                    
      262 +      <p className="mt-1 text-xs text-[var(--text-secondary)]"
          +>                                                             
      263 +        Each donor can reclaim their share of the unreleased e
          +scrow (                                                       
      264 +        {formatUsdc(campaign.totalRaised - campaign.totalRelea
          +sed)} USDC total). Funds already                              
      265 +        released for approved milestones stay with the creator
          +.                                                             
      266 +      </p>                                                    
      267 +      {account && refund > 0n ? (                             
      268 +        <button                                               
      269 +          className="btn-primary mt-3 w-full"                 
      270 +          disabled={isPending || isConfirming}                
      271 +          onClick={() => execute("claimRefund", [campaign.id])
          +.catch(() => {})}                                             
      272 +        >                                                     
      273 +          {isPending || isConfirming                          
      274 +            ? "Claiming…"                                     
      275 +            : `Claim my ${formatUsdc(refund)} USDC refund`}   
      276 +        </button>                                             
      277 +      ) : (                                                   
      278 +        <p className="mt-2 text-xs text-[var(--text-tertiary)]
          +">                                                            
      279 +          {account                                            
      280 +            ? "This wallet has no refund to claim (nothing don
          +ated, or already claimed)."                                   
      281 +            : "Connect the wallet you donated with to claim yo
          +ur refund."}                                                  
      282 +        </p>                                                  
      283 +      )}                                                      
      284 +      <div className="mt-2 min-h-[1.25rem]">                  
      285 +        <TxFeedback                                           
      286 +          isPending={isPending}                               
      287 +          isConfirming={isConfirming}                         
      288 +          isConfirmed={isConfirmed}                           
      289 +          error={error}                                       
      290 +          hash={hash}                                         
      291 +          successText="Refund claimed — USDC returned to your 
          +wallet."                                                      
      292 +        />                                                    
      293 +      </div>                                                  
      294 +    </div>                                                    
      295 +  );                                                          
      296 +}                                                             

⏺ Now the milestone timeline (new criteria shape + review states) and wiring
  ReviewPanel into the campaign page:

⏺ Write(components/MilestoneTimeline.tsx)
  ⎿  Added 64 lines, removed 22 lines
      1  "use client";
      2  
      3  import type { Campaign, Milestone } from "../lib/types";
      4 -import { formatUsdc, milestoneStatus, milestoneStatusMeta } from
        - "../lib/format";                                               
      5 -import { EvidenceLink } from "./EvidenceLink";                  
      4 +import { formatDeadline, formatUsdc, milestoneStatus, milestoneS
        +tatusMeta } from "../lib/format";                               
      5  
      6  export function MilestoneTimeline({
      7    campaign,
     ...
       20    return (
       21      <ol className="relative space-y-3">
       22        {milestones.map((m, i) => {
       24 -        const status = milestoneStatus(m, i, current, totalRai
          -sed);                                                         
       25 -        const meta = milestoneStatusMeta(status);             
       26 -        const isActive = i === current && !campaign.completed;
       23          const cumTarget = cumulativeTargets[i] ?? 0n;
       24 +        const status = milestoneStatus(m, i, current, cumTarge
          +t, totalRaised);                                              
       25 +        const meta = milestoneStatusMeta(status);             
       26 +        const isActive = i === current && !campaign.completed 
          +&& campaign.active;                                           
       27  
       28          return (
       29            <li
       30              key={i}
       31              className={`card relative p-4 transition ${
       33 -              isActive ? "border-[var(--brand-primary)]/40 sha
          -dow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]" :
          - ""                                                           
       32 +              isActive                                        
       33 +                ? "border-[var(--brand-primary)]/40 shadow-[0_
          +1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]"         
       34 +                : ""                                          
       35              }`}
       36            >
       37              <div className="flex items-start gap-3">
       38                {/* Step indicator */}
       39                <span
       40                  className={`flex h-7 w-7 shrink-0 items-center
            justify-center rounded-full text-xs font-bold ${
       40 -                  status === "released"                       
       41 +                  status === "approved"                       
       42                      ? "bg-[var(--brand-primary)] text-[var(--o
           n-brand)]"
       43                      : isActive
       44                        ? "bg-[var(--brand-primary)]/20 text-[va
           r(--brand-primary)] ring-1 ring-[var(--brand-primary)]/40"
       45                        : "bg-[var(--bg-subtle)] text-[var(--tex
           t-tertiary)]"
       46                  }`}
       47                >
       47 -                {status === "released" ? "✓" : i + 1}         
       48 +                {status === "approved" ? "✓" : i + 1}         
       49                </span>
       50  
       51                <div className="min-w-0 flex-1">
       52                  <div className="flex flex-wrap items-center ju
           stify-between gap-2">
       52 -                  <p className="font-medium text-[var(--text-p
          -rimary)]">{m.description}</p>                                 
       53 +                  <p className="font-medium text-[var(--text-p
          +rimary)]">{m.criteria.title}</p>                              
       54                    <div className="flex items-center gap-2">
       54 -                    <span className="text-xs text-[var(--text-
          -tertiary)]">at {formatUsdc(cumTarget)} USDC</span>            
       55 +                    <span className="text-xs text-[var(--text-
          +tertiary)]">                                                  
       56 +                      at {formatUsdc(cumTarget)} USDC         
       57 +                    </span>                                   
       58                      <span className="font-mono text-sm font-se
           mibold text-[var(--brand-primary)]">
       59                        +{formatUsdc(m.amount)} USDC
       60                      </span>
       61                    </div>
       62                  </div>
       63  
       61 -                <div className="mt-1.5 flex items-center gap-2
          -">                                                            
       64 +                <div className="mt-1.5 flex flex-wrap items-ce
          +nter gap-2">                                                  
       65                    <span className={`pill ${meta.pill}`}>
       66                      <span className={`h-1.5 w-1.5 rounded-full
            ${meta.dot}`} />
       67                      {meta.label}
       68                    </span>
       69 +                  {m.criteria.proofDeadline !== 0n && (       
       70 +                    <span className="text-xs text-[var(--text-
          +tertiary)]">                                                  
       71 +                      proof due {formatDeadline(m.criteria.pro
          +ofDeadline)}                                                  
       72 +                    </span>                                   
       73 +                  )}                                          
       74 +                  {m.submissionCount > 0 && (                 
       75 +                    <span className="text-xs text-[var(--text-
          +tertiary)]">                                                  
       76 +                      {m.submissionCount} submission{m.submiss
          +ionCount === 1 ? "" : "s"}                                    
       77 +                    </span>                                   
       78 +                  )}                                          
       79                  </div>
       80  
       68 -                {isActive && status === "awaiting-evidence" &&
          - (                                                            
       81 +                {/* Acceptance criteria — always inspectable *
          +/}                                                            
       82 +                <details className="mt-2">                    
       83 +                  <summary className="cursor-pointer text-xs f
          +ont-medium text-[var(--text-secondary)] hover:text-[var(--text
          +-primary)]">                                                  
       84 +                    Acceptance criteria                       
       85 +                  </summary>                                  
       86 +                  <div className="mt-1 space-y-1 rounded-lg bg
          +-[var(--bg-faint)] px-3 py-2 text-xs text-[var(--text-secondar
          +y)]">                                                         
       87 +                    <p>                                       
       88 +                      <span className="font-medium text-[var(-
          +-text-primary)]">Success: </span>                             
       89 +                      {m.criteria.successDefinition}          
       90 +                    </p>                                      
       91 +                    {m.criteria.requiredProof && (            
       92 +                      <p>                                     
       93 +                        <span className="font-medium text-[var
          +(--text-primary)]">                                           
       94 +                          Required proof:{" "}                
       95 +                        </span>                               
       96 +                        {m.criteria.requiredProof}            
       97 +                      </p>                                    
       98 +                    )}                                        
       99 +                    {m.criteria.expectedMetrics && (          
      100 +                      <p>                                     
      101 +                        <span className="font-medium text-[var
          +(--text-primary)]">Metrics: </span>                           
      102 +                        {m.criteria.expectedMetrics}          
      103 +                      </p>                                    
      104 +                    )}                                        
      105 +                    {m.criteria.reportingPeriod && (          
      106 +                      <p>                                     
      107 +                        <span className="font-medium text-[var
          +(--text-primary)]">Reporting: </span>                         
      108 +                        {m.criteria.reportingPeriod}          
      109 +                      </p>                                    
      110 +                    )}                                        
      111 +                  </div>                                      
      112 +                </details>                                    
      113 +                                                              
      114 +                {isActive && status === "awaiting-proof" && ( 
      115                    <p className="mt-2 text-xs text-[var(--text-
           warning)]">
       70 -                    Waiting for the creator to submit proof — 
          -funds release automatically on submission.                    
      116 +                    Waiting for the creator&apos;s proof packa
          +ge — funds release only after                                 
      117 +                    reviewer approval.                        
      118                    </p>
      119                  )}
       73 -                                                              
       74 -                {/* On-chain proof */}                        
       75 -                {m.evidenceSubmitted && (                     
       76 -                  <div className="mt-2 rounded-lg bg-[var(--bg
          --faint)] px-3 py-2 text-sm">                                  
       77 -                    <p className="mb-0.5 text-xs uppercase tra
          -cking-wide text-[var(--text-tertiary)]">                      
       78 -                      On-chain proof                          
       79 -                    </p>                                      
       80 -                    <EvidenceLink evidence={m.evidence} />    
       81 -                  </div>                                      
      120 +                {isActive && status === "under-review" && (   
      121 +                  <p className="mt-2 text-xs text-violet-700">
      122 +                    Proof submitted — reviewers are evaluating
          + it against the criteria above.                               
      123 +                  </p>                                        
      124                  )}
      125                </div>
      126              </div>

⏺ Update(app/campaigns/[id]/page.tsx)
  ⎿  Added 1 line
      18  import { MilestoneTimeline } from "../../../components/Mileston
          eTimeline";
      19  import { DonationPanel } from "../../../components/DonationPane
          l";
      20  import { EvidencePanel } from "../../../components/EvidencePane
          l";
      21 +import { ReviewPanel } from "../../../components/ReviewPanel"; 
      22  import { ActivityFeed } from "../../../components/ActivityFeed"
          ;
      23  
      24  export default function CampaignDetailPage() {

⏺ Update(app/campaigns/[id]/page.tsx)
  ⎿  Added 1 line
      161  
      162          <div className="space-y-6 lg:sticky lg:top-20 lg:self-
           start">
      163            <DonationPanel campaign={campaign} />
      164 +          <ReviewPanel campaign={campaign} milestones={milesto
          +nes} />                                                       
      165            <EvidencePanel campaign={campaign} milestones={miles
           tones} isCreator={isCreator} />
      166          </div>
      167        </div>

⏺ Update(hooks/useActivity.ts)
  ⎿  Added 5 lines, removed 2 lines
      69  export type ActivityType =
      70    | "CampaignCreated"
      71    | "DonationReceived"
      72 -  | "EvidenceSubmitted"                                        
      72 +  | "ProofSubmitted"                                           
      73 +  | "ProofReviewed"                                            
      74    | "MilestoneReleased"
      74 -  | "CampaignCompleted";                                       
      75 +  | "CampaignCompleted"                                        
      76 +  | "CampaignCancelled"                                        
      77 +  | "RefundClaimed";                                           
      78  
      79  export interface ActivityItem {
      80    type: ActivityType;

⏺ Update(hooks/useActivity.ts)
  ⎿  Added 4 lines, removed 1 line
      88  const EVENT_NAMES: ActivityType[] = [
      89    "CampaignCreated",
      90    "DonationReceived",
      91 -  "EvidenceSubmitted",                                         
      91 +  "ProofSubmitted",                                            
      92 +  "ProofReviewed",                                             
      93    "MilestoneReleased",
      94    "CampaignCompleted",
      95 +  "CampaignCancelled",                                         
      96 +  "RefundClaimed",                                             
      97  ];
      98  
      99  // Base URL of our off-chain indexer running on EC2 (e.g. http:
          //1.2.3.4/api).

⏺ Update(components/ActivityFeed.tsx)
  ⎿  Added 11 lines, removed 2 lines
      12  const ICON: Record<ActivityType, { glyph: string; ring: string 
          }> = {
      13    CampaignCreated: { glyph: "✦", ring: "bg-[var(--bg-subtle)] t
          ext-[var(--text-secondary)]" },
      14    DonationReceived: { glyph: "↓", ring: "bg-[var(--brand-primar
          y)]/15 text-[var(--brand-primary)]" },
      15 -  EvidenceSubmitted: { glyph: "▣", ring: "bg-sky-600/10 text-sk
         -y-700" },                                                      
      15 +  ProofSubmitted: { glyph: "▣", ring: "bg-sky-600/10 text-sky-7
         +00" },                                                         
      16 +  ProofReviewed: { glyph: "⚖", ring: "bg-violet-600/10 text-vio
         +let-700" },                                                    
      17    MilestoneReleased: { glyph: "↑", ring: "bg-emerald-600/10 tex
          t-emerald-700" },
      18    CampaignCompleted: { glyph: "★", ring: "bg-[var(--brand-prima
          ry)]/20 text-[var(--brand-primary)]" },
      19 +  CampaignCancelled: { glyph: "⊘", ring: "bg-red-600/10 text-re
         +d-700" },                                                      
      20 +  RefundClaimed: { glyph: "↩", ring: "bg-red-600/10 text-red-70
         +0" },                                                          
      21  };
      22  
      23  type FlowTag = { label: string; cls: string } | null;
     ...
      27      label: "wallet → escrow",
      28      cls: "text-[var(--brand-primary)] bg-[var(--brand-primary)]
          /10 ring-1 ring-[var(--brand-primary)]/20",
      29    },
      27 -  EvidenceSubmitted: null,                                     
      30 +  ProofSubmitted: null,                                        
      31 +  ProofReviewed: null,                                         
      32    MilestoneReleased: {
      33      label: "escrow → creator wallet",
      34      cls: "text-emerald-700 bg-emerald-600/10 ring-1 ring-emeral
          d-600/20",
      35    },
      36    CampaignCompleted: null,
      37 +  CampaignCancelled: null,                                     
      38 +  RefundClaimed: {                                             
      39 +    label: "escrow → donor wallet",                            
      40 +    cls: "text-red-700 bg-red-600/10 ring-1 ring-red-600/20",  
      41 +  },                                                           
      42  };
      43  
      44  function describe(item: ActivityItem): React.ReactNode {

⏺ Update(components/ActivityFeed.tsx)  ⎿  Added 34 lines, removed 5 lines
       63            <span className="font-mono text-[var(--text-primary)
           ]">{formatUsdc(a.totalRaised)} USDC</span>
       64          </>
       65        );
       66 -    case "EvidenceSubmitted":                                 
       66 +    case "ProofSubmitted":                                    
       67        return (
       68          <>
       69 -          Creator posted on-chain proof for {ms} — this milest
          -one&apos;s funds release to the                               
       70 -          creator in the same transaction                     
       69 +          Creator submitted a proof package for {ms}          
       70 +          {a.summary ? <> — &ldquo;{String(a.summary)}&rdquo;<
          +/> : null}. Funds stay locked until                           
       71 +          reviewers approve it                                
       72          </>
       73        );
       74 +    case "ProofReviewed":                                     
       75 +      return a.approved ? (                                   
       76 +        <>                                                    
       77 +          Reviewer <span className="font-mono">{shortenAddress
          +(a.reviewer)}</span> approved the                             
       78 +          proof for {ms}                                      
       79 +        </>                                                   
       80 +      ) : (                                                   
       81 +        <>                                                    
       82 +          Reviewer <span className="font-mono">{shortenAddress
          +(a.reviewer)}</span> requested                                
       83 +          changes on {ms}                                     
       84 +          {a.notes ? <> — &ldquo;{String(a.notes)}&rdquo;</> :
          + null}                                                        
       85 +        </>                                                   
       86 +      );                                                      
       87      case "MilestoneReleased":
       88        return (
       89          <>
       90            <span className="font-mono text-emerald-700">{format
           Usdc(a.amount)} USDC</span> transferred
       91            from escrow to creator{" "}
       78 -          <span className="font-mono">{shortenAddress(a.creato
          -r)}</span> for {ms}                                           
       92 +          <span className="font-mono">{shortenAddress(a.creato
          +r)}</span> for {ms} after reviewer                            
       93 +          approval                                            
       94          </>
       95        );
       96      case "CampaignCompleted":
       82 -      return <>All milestones proven and released — campaign c
          -omplete</>;                                                   
       97 +      return <>All milestones approved and released — campaign
          + complete</>;                                                 
       98 +    case "CampaignCancelled":                                 
       99 +      return (                                                
      100 +        <>                                                    
      101 +          Campaign {a.voluntary ? "cancelled by the creator" :
          + "failed on a missed deadline"} —                             
      102 +          donor refunds are open for the unreleased escrow    
      103 +        </>                                                   
      104 +      );                                                      
      105 +    case "RefundClaimed":                                     
      106 +      return (                                                
      107 +        <>                                                    
      108 +          <span className="font-mono">{shortenAddress(a.donor)
          +}</span> reclaimed{" "}                                       
      109 +          <span className="font-mono text-red-700">{formatUsdc
          +(a.amount)} USDC</span> from escrow                           
      110 +        </>                                                   
      111 +      );                                                      
      112      default:
      113        return item.type;
      114    }

⏺ Update(app/dashboard/page.tsx)
  ⎿  File must be read first

  Read 1 file (ctrl+o to expand)

⏺ Update(app/dashboard/page.tsx)
  ⎿  Added 2 lines, removed 1 line
      58                    Wallet <Address address={address} className="
          text-[var(--text-primary)]" />
      59                  </p>
      60                  <p className="mt-1 text-xs text-[var(--text-ter
          tiary)]">
      61 -                  Reputation grows as you complete proof-backed
         - milestones.                                                   
      61 +                  Reputation only grows when reviewers approve 
         +your milestone proof — submissions                             
      62 +                  alone don&apos;t count.                      
      63                  </p>
      64                </div>
      65                <ReputationBadge score={score} variant="full" />

⏺ Update(app/dashboard/page.tsx)
  ⎿  Added 2 lines, removed 2 lines
      68              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid
          -cols-3 lg:grid-cols-6">
      69                <Stat label="Campaigns" value={(stats?.campaignsC
          reated ?? 0n).toString()} />
      70                <Stat label="Completed" value={(stats?.campaignsC
          ompleted ?? 0n).toString()} />
      71 -              <Stat label="Milestones" value={(stats?.milestone
         -sCompleted ?? 0n).toString()} />                               
      72 -              <Stat label="Evidence" value={(stats?.evidenceUpd
         -ates ?? 0n).toString()} />                                     
      71 +              <Stat label="Approved" value={(stats?.milestonesA
         +pproved ?? 0n).toString()} />                                  
      72 +              <Stat label="Submissions" value={(stats?.proofSub
         +missions ?? 0n).toString()} />                                 
      73                <Stat label="Raised" value={formatUsdc(stats?.tot
          alRaised)} sub="USDC" accent />
      74                <Stat label="Released" value={formatUsdc(stats?.t
          otalReleased)} sub="USDC" />
      75              </div>

⏺ Update(lib/contract.ts)
  ⎿  Added 11 lines, removed 3 lines
      41  }
      42  
      43  /**
      44 - * A "current" Covenant deployment must match the USDC write fl
         -ow the frontend                                                
      45 - * implements: donate(campaignId, amount) as a non-payable call
         -.                                                              
      44 + * A "current" Covenant deployment must match the write flow th
         +e frontend                                                     
      45 + * implements: USDC donate(campaignId, amount), structured proo
         +f submission,                                                  
      46 + * reviewer-gated releases, and donor refunds. Older auto-relea
         +se deployments                                                 
      47 + * (submitEvidence) are treated as legacy so the app never writ
         +es to them.                                                    
      48   */
      49  export function isWriteCompatibleDeployment(chainId?: number): 
          boolean {
      50    const deployment = getCovenant(chainId);
      51    const donate = getAbiFunction(deployment?.abi, "donate");
      50 -  return donate?.inputs?.length === 2 && donate.stateMutability
         - === "nonpayable";                                             
      52 +  const donateOk = donate?.inputs?.length === 2 && donate.state
         +Mutability === "nonpayable";                                   
      53 +  return (                                                     
      54 +    donateOk &&                                                
      55 +    !!getAbiFunction(deployment?.abi, "submitProof") &&        
      56 +    !!getAbiFunction(deployment?.abi, "reviewProof") &&        
      57 +    !!getAbiFunction(deployment?.abi, "claimRefund")           
      58 +  );                                                           
      59  }
      60  
      61  export function getDeploymentMode(chainId?: number): Deployment
          Mode {

⏺ Now running the frontend typecheck to flush out remaining stale references:

  Searched for 1 pattern, read 1 file, ran 1 shell command (ctrl+o to expand)

⏺ The legacy history pages decode the old contract's structs — they need their
  own legacy types rather than the new ones. Let me fix that:

  Read 2 files (ctrl+o to expand)

⏺ Update(lib/legacy.ts)
  ⎿  Added 39 lines
      13  export const legacyAbi = legacy.abi as Abi;
      14  export const legacyDeployBlock = BigInt(legacy.deployBlock ?? 0
          );
      15  
      16 +// Struct shapes of the retired deployment — frozen; do not evo
         +lve these with                                                 
      17 +// the live contract's types.                                  
      18 +export interface LegacyMilestone {                             
      19 +  description: string;                                         
      20 +  amount: bigint;                                              
      21 +  evidence: string;                                            
      22 +  evidenceSubmitted: boolean;                                  
      23 +  released: boolean;                                           
      24 +}                                                              
      25 +                                                               
      26 +export interface LegacyCampaign {                              
      27 +  id: bigint;                                                  
      28 +  creator: `0x${string}`;                                      
      29 +  title: string;                                               
      30 +  description: string;                                         
      31 +  goalAmount: bigint;                                          
      32 +  totalRaised: bigint;                                         
      33 +  totalReleased: bigint;                                       
      34 +  active: boolean;                                             
      35 +  completed: boolean;                                          
      36 +  currentMilestone: bigint;                                    
      37 +  createdAt: bigint;                                           
      38 +  donorCount: bigint;                                          
      39 +  milestoneCount: bigint;                                      
      40 +}                                                              
      41 +                                                               
      42 +export function legacyCampaignStatus(c: LegacyCampaign): { labe
         +l: string; pill: string } {                                    
      43 +  if (c.completed) {                                           
      44 +    return {                                                   
      45 +      label: "Completed",                                      
      46 +      pill: "bg-[var(--brand-secondary)] text-[var(--brand-prim
         +ary)] ring-1 ring-[var(--brand-primary)]/25",                  
      47 +    };                                                         
      48 +  }                                                            
      49 +  return {                                                     
      50 +    label: "Archived",                                         
      51 +    pill: "bg-[var(--bg-subtle)] text-[var(--text-tertiary)] ri
         +ng-1 ring-[var(--border-primary)]",                            
      52 +  };                                                           
      53 +}                                                              
      54 +                                                               
      55  /** Legacy campaigns were denominated in ETH (18 decimals), not
           USDC. */
      56  export function formatLegacyEth(wei: bigint | undefined, maxDig
          its = 10): string {
      57    if (wei === undefined) return "0";

⏺ Update(hooks/useLegacy.ts)
  ⎿  Added 7 lines, removed 2 lines
       1  "use client";
       2  
       3  import { useReadContract } from "wagmi";
       4 -import { LEGACY_CHAIN_ID, legacyAbi, legacyAddress } from "../l
         -ib/legacy";                                                    
       5 -import type { Campaign, Milestone } from "../lib/types";       
       4 +import {                                                       
       5 +  LEGACY_CHAIN_ID,                                             
       6 +  legacyAbi,                                                   
       7 +  legacyAddress,                                               
       8 +  type LegacyCampaign,                                         
       9 +  type LegacyMilestone,                                        
      10 +} from "../lib/legacy";                                        
      11  
      12  /**
      13   * Read hooks for the retired Base Mainnet contract shown in th
          e History tab.

⏺ Update(hooks/useLegacy.ts)
  ⎿  Added 1 line, removed 1 line
      22      functionName: "getAllCampaigns",
      23      chainId: LEGACY_CHAIN_ID,
      24    });
      25 -  return { ...q, campaigns: (q.data as Campaign[] | undefined) 
         -?? [] };                                                       
      25 +  return { ...q, campaigns: (q.data as LegacyCampaign[] | undef
         +ined) ?? [] };                                                 
      26  }
      27  
      28  export function useLegacyCampaign(id?: bigint) {

⏺ Update(hooks/useLegacy.ts)
  ⎿  Added 1 line, removed 1 line
      34      chainId: LEGACY_CHAIN_ID,
      35      query: { enabled: id !== undefined },
      36    });
      37 -  return { ...q, campaign: q.data as Campaign | undefined };   
      37 +  return { ...q, campaign: q.data as LegacyCampaign | undefined
         + };                                                            
      38  }
      39  
      40  export function useLegacyMilestones(id?: bigint) {

⏺ Update(hooks/useLegacy.ts)
  ⎿  Added 1 line, removed 1 line
      46      chainId: LEGACY_CHAIN_ID,
      47      query: { enabled: id !== undefined },
      48    });
      49 -  return { ...q, milestones: (q.data as Milestone[] | undefined
         -) ?? [] };                                                     
      49 +  return { ...q, milestones: (q.data as LegacyMilestone[] | und
         +efined) ?? [] };                                               
      50  }

⏺ Update(app/history/[id]/page.tsx)
  ⎿  Added 7 lines, removed 3 lines
       2  
       3  import Link from "next/link";
       4  import { useParams } from "next/navigation";
       5 -import type { Milestone } from "../../../lib/types";           
       6 -import { campaignStatus, percent } from "../../../lib/format"; 
       7 -import { formatLegacyEth, legacyAddress } from "../../../lib/le
         -gacy";                                                         
       5 +import { percent } from "../../../lib/format";                 
       6 +import {                                                       
       7 +  formatLegacyEth,                                             
       8 +  legacyAddress,                                               
       9 +  legacyCampaignStatus,                                        
      10 +  type LegacyMilestone,                                        
      11 +} from "../../../lib/legacy";                                  
      12  import { useLegacyCampaign, useLegacyMilestones } from "../../.
          ./hooks/useLegacy";
      13  import { campaignPhoto } from "../../../lib/campaignImage";
      14  import { Address } from "../../../components/Address";

⏺ Update(app/history/[id]/page.tsx)
  ⎿  Added 1 line, removed 1 line
      48      );
      49    }
      50  
      51 -  const status = campaignStatus(campaign);                     
      51 +  const status = legacyCampaignStatus(campaign);               
      52    const raisedPct = percent(campaign.totalRaised, campaign.goal
          Amount);
      53    const inEscrow = campaign.totalRaised - campaign.totalRelease
          d;
      54  

⏺ Update(app/history/[id]/page.tsx)
  ⎿  Added 2 lines, removed 2 lines
      132    index: i,
      133    milestones,
      134  }: {
      135 -  milestone: Milestone;                                       
      135 +  milestone: LegacyMilestone;                                 
      136    index: number;
      137 -  milestones: Milestone[];                                    
      137 +  milestones: LegacyMilestone[];                              
      138  }) {
      139    const cumTarget = milestones.slice(0, i + 1).reduce((s, x) =
           > s + x.amount, 0n);
      140    return (

  Searched for 1 pattern, read 1 file, ran 2 shell commands (ctrl+o to expand)

⏺ Typecheck is clean. Moving to the final task — seed script, deploy safeguards,
  indexer, docs:
⏺ Update(~/Downloads/tracefund/packages/hardhat/scripts/seed.ts)
  ⎿  Added 37 lines, removed 12 lines
       83      console.log("Minted 1000 MockUSDC to each donor");
       84    }
       85  
       86 -  const tx = await covenant                                   
       87 -    .connect(creator)                                         
       88 -    .createCampaign(                                          
       89 -      "Community Medical Relief Fund",                        
       90 -      "A transparent emergency fundraiser where each milestone
          -'s funds unlock only after the creator posts on-chain proof.",
       91 -      [                                                       
       92 -        "Hospital deposit receipt",                           
       93 -        "Medication purchase receipt",                        
       94 -        "Follow-up appointment confirmation",                 
       95 -      ],                                                      
       96 -      MILESTONE_AMOUNTS.map((a) => usdc6(a)),                 
       97 -    );                                                        
       86 +  // Lead-donor approval keeps the demo self-contained: donor 
          +A ends up the                                                 
       87 +  // largest donor and can approve/reject the creator's proof 
          +packages.                                                     
       88 +  const criteria = [                                          
       89 +    {                                                         
       90 +      title: "Hospital deposit paid",                         
       91 +      successDefinition:                                      
       92 +        "The hospital deposit is paid in full, with a receipt 
          +matching the milestone amount.",                              
       93 +      reportingPeriod: "Once, at admission",                  
       94 +      expectedMetrics: "",                                    
       95 +      requiredProof: "Deposit receipt (photo or PDF) with hosp
          +ital reference number",                                       
       96 +    },                                                        
       97 +    {                                                         
       98 +      title: "Medication purchased",                          
       99 +      successDefinition: "The prescribed medication is purchas
          +ed as itemized in the receipt.",                              
      100 +      reportingPeriod: "Once, at purchase",                   
      101 +      expectedMetrics: "",                                    
      102 +      requiredProof: "Itemized pharmacy receipt, photo of medi
          +cation",                                                      
      103 +    },                                                        
      104 +    {                                                         
      105 +      title: "Follow-up appointment completed",               
      106 +      successDefinition: "The follow-up appointment took place
          + and is documented.",                                         
      107 +      reportingPeriod: "Once, after the appointment",         
      108 +      expectedMetrics: "",                                    
      109 +      requiredProof: "Appointment confirmation or discharge no
          +te",                                                          
      110 +    },                                                        
      111 +  ];                                                          
      112 +                                                              
      113 +  const tx = await covenant.connect(creator).createCampaign(  
      114 +    "Community Medical Relief Fund",                          
      115 +    "A transparent emergency fundraiser: each milestone's fund
          +s unlock only after the lead donor approves the creator's proo
          +f package against the acceptance criteria.",                  
      116 +    0, // CampaignKind.Charity                                
      117 +    { model: 1 /* ApprovalModel.LeadDonor */, reviewers: [], t
          +hreshold: 1 },                                                
      118 +    criteria.map((c, i) => ({                                 
      119 +      criteria: { ...c, proofDeadline: 0 },                   
      120 +      amount: usdc6(MILESTONE_AMOUNTS[i]),                    
      121 +    })),                                                      
      122 +  );                                                          
      123    const receipt = await tx.wait();
      124  
      125    // Derive the new campaign id from the emitted event.

⏺ Update(~/Downloads/tracefund/packages/hardhat/scripts/seed.ts)
  ⎿  Added 4 lines, removed 1 line
      151    await (await covenant.connect(donorA).donate(campaignId, usd
           c6(DONATION_A2))).wait();
      152    console.log(`Donor A donated ${DONATION_A2} USDC (total now 
           at the ${goal} USDC goal)`);
      153  
      154 -  console.log(`\nDemo ready: milestone one is funded and waiti
          -ng for evidence.`);                                           
      154 +  console.log(                                                
      155 +    `\nDemo ready: milestone one is funded and waiting for the
          + creator's proof package.` +                                  
      156 +      `\nDonor A (${donorA.address}) is the lead donor and rev
          +iews the proof.`,                                             
      157 +  );                                                          
      158  }
      159  
      160  /** Build a signer from a private key in the environment, conn
           ected to the provider. */

⏺ Update(~/Downloads/tracefund/packages/hardhat/scripts/deploy.ts)
  ⎿  Added 45 lines
       84  
       85    console.log(`Covenant deployed to: ${address} (block ${deplo
           yBlock})`);
       86  
       87 +  // Post-deploy verification: the immutable token baked into 
          +the contract                                                  
       88 +  // must be exactly the address we validated above, and the c
          +ontract itself                                                
       89 +  // must have bytecode. Fail loudly rather than exporting a b
          +roken config.                                                 
       90 +  const onChainUsdc = await covenant.usdc();                  
       91 +  if (onChainUsdc.toLowerCase() !== usdcAddress.toLowerCase())
          + {                                                            
       92 +    throw new Error(                                          
       93 +      `Deployed Covenant reports usdc()=${onChainUsdc}, expect
          +ed ${usdcAddress} — aborting export.`,                        
       94 +    );                                                        
       95 +  }                                                           
       96 +  const covenantCode = await ethers.provider.getCode(address);
       97 +  if (covenantCode === "0x") {                                
       98 +    throw new Error(`No bytecode at deployed Covenant address 
          +${address} — aborting export.`);                              
       99 +  }                                                           
      100 +  console.log(`  verified on-chain: usdc() matches, Covenant b
          +ytecode present`);                                            
      101 +                                                              
      102    await exportToFrontend(chainId, address, deployBlock, usdcAd
           dress);
      103 +  verifyExport(chainId, address, usdcAddress);                
      104  
      105    console.log(`\nDone. Frontend contract config updated for ch
           ainId ${chainId}.\n`);
      106  }
      107  
      108  /**
      109 + * Read the exported frontend config back and confirm it match
          +es what was                                                   
      110 + * actually deployed — the frontend must never point at a diff
          +erent contract                                                
      111 + * or token than the chain has.                               
      112 + */                                                           
      113 +function verifyExport(chainId: number, address: string, usdcAd
          +dress: string) {                                              
      114 +  const outFile = path.resolve(__dirname, "../../nextjs/contra
          +cts/deployedContracts.json");                                 
      115 +  const json = JSON.parse(fs.readFileSync(outFile, "utf8"));  
      116 +  const entry = json?.[chainId];                              
      117 +  if (                                                        
      118 +    entry?.Covenant?.address !== address ||                   
      119 +    entry?.USDC?.address !== usdcAddress ||                   
      120 +    !Array.isArray(entry?.Covenant?.abi)                      
      121 +  ) {                                                         
      122 +    throw new Error(                                          
      123 +      `Exported frontend config for chainId ${chainId} does no
          +t match the deployment — fix before shipping.`,               
      124 +    );                                                        
      125 +  }                                                           
      126 +  const abiNames = new Set(                                   
      127 +    entry.Covenant.abi.filter((f: any) => f.type === "function
          +").map((f: any) => f.name),                                   
      128 +  );                                                          
      129 +  for (const fn of ["submitProof", "reviewProof", "claimRefund
          +", "failCampaign"]) {                                         
      130 +    if (!abiNames.has(fn)) {                                  
      131 +      throw new Error(`Exported ABI is missing ${fn}() — stale
          + artifact? Recompile and redeploy.`);                         
      132 +    }                                                         
      133 +  }                                                           
      134 +  console.log(`  verified export: frontend config matches depl
          +oyed contract + token`);                                      
      135 +}                                                             
      136 +                                                              
      137 +/**                                                           
      138   * Writes the deployment into packages/nextjs/contracts/deploy
           edContracts.json,
      139   * merging with any existing entries so multiple networks can 
           coexist.
      140   */

⏺ Now the indexer — new event ABI and the off-chain evidence registry endpoints:

⏺ Write(~/Downloads/tracefund/packages/indexer/src/abi.js)
  ⎿  Added 45 lines, removed 5 lines
      1 -// The five events emitted by Covenant.sol. The indexer only nee
        -ds the EVENT                                                    
      2 -// fragments of the ABI — it never calls functions, it only list
        -ens.                                                            
      3 -// These signatures match contracts/Covenant.sol exactly.       
      1 +// The events emitted by Covenant.sol (proof/review flow). The i
        +ndexer only                                                     
      2 +// needs the EVENT fragments of the ABI — it never calls functio
        +ns, it only                                                     
      3 +// listens. These signatures match contracts/Covenant.sol exactl
        +y.                                                              
      4  export const COVENANT_EVENTS = [
      5    {
      6      type: "event",
     ...
      25    },
      26    {
      27      type: "event",
      28 -    name: "EvidenceSubmitted",                                 
      28 +    name: "ProofSubmitted",                                    
      29      inputs: [
      30        { name: "campaignId", type: "uint256", indexed: true },
      31        { name: "milestoneIndex", type: "uint256", indexed: true 
          },
      32 -      { name: "evidence", type: "string", indexed: false },    
      32 +      { name: "submissionIndex", type: "uint256", indexed: fals
         +e },                                                           
      33 +      { name: "manifestHash", type: "bytes32", indexed: false }
         +,                                                              
      34 +      { name: "summary", type: "string", indexed: false },     
      35      ],
      36    },
      37    {
      38      type: "event",
      39 +    name: "ProofReviewed",                                     
      40 +    inputs: [                                                  
      41 +      { name: "campaignId", type: "uint256", indexed: true },  
      42 +      { name: "milestoneIndex", type: "uint256", indexed: true 
         +},                                                             
      43 +      { name: "reviewer", type: "address", indexed: true },    
      44 +      { name: "submissionIndex", type: "uint256", indexed: fals
         +e },                                                           
      45 +      { name: "approved", type: "bool", indexed: false },      
      46 +      { name: "notes", type: "string", indexed: false },       
      47 +    ],                                                         
      48 +  },                                                           
      49 +  {                                                            
      50 +    type: "event",                                             
      51      name: "MilestoneReleased",
      52      inputs: [
      53        { name: "campaignId", type: "uint256", indexed: true },
     ...
      61      name: "CampaignCompleted",
      62      inputs: [{ name: "campaignId", type: "uint256", indexed: tr
          ue }],
      63    },
      64 +  {                                                            
      65 +    type: "event",                                             
      66 +    name: "CampaignCancelled",                                 
      67 +    inputs: [                                                  
      68 +      { name: "campaignId", type: "uint256", indexed: true },  
      69 +      { name: "milestoneIndex", type: "uint256", indexed: false
         + },                                                            
      70 +      { name: "voluntary", type: "bool", indexed: false },     
      71 +    ],                                                         
      72 +  },                                                           
      73 +  {                                                            
      74 +    type: "event",                                             
      75 +    name: "RefundClaimed",                                     
      76 +    inputs: [                                                  
      77 +      { name: "campaignId", type: "uint256", indexed: true },  
      78 +      { name: "donor", type: "address", indexed: true },       
      79 +      { name: "amount", type: "uint256", indexed: false },     
      80 +    ],                                                         
      81 +  },                                                           
      82 +  {                                                            
      83 +    type: "event",                                             
      84 +    name: "CreatorApprovalChanged",                            
      85 +    inputs: [                                                  
      86 +      { name: "creator", type: "address", indexed: true },     
      87 +      { name: "approved", type: "bool", indexed: false },      
      88 +    ],                                                         
      89 +  },                                                           
      90  ];

⏺ Update(~/Downloads/tracefund/packages/indexer/src/db.js)
  ⎿  Added 12 lines
      32        key   TEXT PRIMARY KEY,
      33        value TEXT
      34      );
      35 +                                                               
      36 +    -- Off-chain evidence registry: full proof-package manifest
         +s, addressed by                                                
      37 +    -- the keccak256 hash that Covenant stores on-chain. Access
         + model is                                                      
      38 +    -- capability-by-hash (the hash is on-chain, so effectively
         + "unlisted").                                                  
      39 +    -- TODO(privacy): production needs authenticated access (re
         +viewer                                                         
      40 +    -- allowlists from the campaign's approval config, expiring
         + links, and an                                                 
      41 +    -- access audit log) before genuinely confidential document
         +s belong here.                                                 
      42 +    CREATE TABLE IF NOT EXISTS evidence (                      
      43 +      hash        TEXT PRIMARY KEY,          -- 0x-prefixed kec
         +cak256, lowercase                                              
      44 +      manifest    TEXT NOT NULL,             -- canonical manif
         +est JSON                                                       
      45 +      created_at  TEXT DEFAULT (datetime('now'))               
      46 +    );                                                         
      47    `);
      48  
      49    return db;

⏺ Update(~/Downloads/tracefund/packages/indexer/src/index.js)
  ⎿  Added 1 line, removed 1 line
      1  import "dotenv/config";
      2  import express from "express";
      3  import cors from "cors";
      4 -import { createPublicClient, http } from "viem";                
      4 +import { createPublicClient, http, keccak256, toBytes } from "vi
        +em";                                                            
      5  import { base } from "viem/chains";
      6  import { COVENANT_EVENTS } from "./abi.js";
      7  import { openDb, getCursor, setCursor, insertEvent } from "./db.
         js";

⏺ Update(~/Downloads/tracefund/packages/indexer/src/index.js)
  ⎿  Added 2 lines
      117  function startApi() {
      118    const app = express();
      119    app.use(cors()); // let the browser frontend call us from an
           other domain
      120 +  // Evidence manifests arrive as raw JSON bodies; cap the siz
          +e defensively.                                                
      121 +  app.use(express.text({ type: "application/json", limit: "256
          +kb" }));                                                      
      122  
      123    app.get("/health", (_req, res) => {
      124      const last = getCursor(db, DEPLOY_BLOCK);

⏺ Update(~/Downloads/tracefund/packages/indexer/src/index.js)
  ⎿  Added 30 lines
      166      res.json(rows.map((r) => ({ ...r, args: JSON.parse(r.args)
            })));
      167    });
      168  
      169 +  // ---- Off-chain evidence registry ------------------------
          +-----------------                                             
      170 +  // Full proof-package manifests, addressed by the keccak256 
          +hash Covenant                                                 
      171 +  // stores on-chain. The server re-hashes the body before sto
          +ring, so the                                                  
      172 +  // registry can never serve content that doesn't match its a
          +ddress —                                                      
      173 +  // reviewers get integrity for free. Access model is capabil
          +ity-by-hash                                                   
      174 +  // ("unlisted"); see the TODO(privacy) note in db.js for the
          + auth roadmap.                                                
      175 +  const isHash = (v) => /^0x[0-9a-fA-F]{64}$/.test(String(v));
      176 +                                                              
      177 +  app.put("/evidence/:hash", (req, res) => {                  
      178 +    const hash = String(req.params.hash).toLowerCase();       
      179 +    if (!isHash(hash)) return res.status(400).json({ error: "i
          +nvalid hash" });                                              
      180 +    const body = typeof req.body === "string" ? req.body : "";
      181 +    if (!body) return res.status(400).json({ error: "missing m
          +anifest body" });                                             
      182 +    if (keccak256(toBytes(body)).toLowerCase() !== hash) {    
      183 +      return res.status(400).json({ error: "manifest does not 
          +hash to the given address" });                                
      184 +    }                                                         
      185 +    db.prepare(                                               
      186 +      "INSERT OR IGNORE INTO evidence (hash, manifest) VALUES 
          +(?, ?)",                                                      
      187 +    ).run(hash, body);                                        
      188 +    res.json({ ok: true });                                   
      189 +  });                                                         
      190 +                                                              
      191 +  app.get("/evidence/:hash", (req, res) => {                  
      192 +    const hash = String(req.params.hash).toLowerCase();       
      193 +    if (!isHash(hash)) return res.status(400).json({ error: "i
          +nvalid hash" });                                              
      194 +    const row = db.prepare("SELECT manifest FROM evidence WHER
          +E hash = ?").get(hash);                                       
      195 +    if (!row) return res.status(404).json({ error: "not found"
          + });                                                          
      196 +    res.type("application/json").send(row.manifest);          
      197 +  });                                                         
      198 +                                                              
      199    // Quick counts for a dashboard.
      200    app.get("/stats", (_req, res) => {
      201      const byType = db

⏺ Now the end-to-end verification: full test suite, an in-process deploy to
  exercise the new safeguards and regenerate the ABI export, then a final
  typecheck:

  Ran 5 shell commands (ctrl+o to expand)

⏺ The full lifecycle works against a live deployment. Cleaning up the node and
  writing the architecture doc:

  Ran 1 shell command (ctrl+o to expand)

⏺ Write(~/Downloads/tracefund/docs/PROOF_REVIEW_ARCHITECTURE.md)
  ⎿  Wrote 122 lines to ../../docs/PROOF_REVIEW_ARCHITECTURE.md
       1 # Covenant Proof / Review / Refund Architecture
       2 
       3 _Last updated: July 4, 2026 — this replaces the auto-release evi
         dence model._
       4 
       6 
       7 ```
       8 create (criteria + approval config) → donate (USDC escrow)
       9   → submitProof (package hash on-chain; NO release)
      10   → reviewProof (approve / reject with notes)
     … +176 lines (ctrl+o to expand)

  Recalled 1 memory, wrote 2 memories (ctrl+o to expand)
⏺ The build is complete and verified end-to-end. Here's the full picture:

  What was implemented

  Contract (Covenant.sol — full redesign, compiles, 40/40 tests pass). The
  auto-release submitEvidence is gone. The new flow is exactly what you
  described in your mid-task message: the creator submits proof, the
  donor/reviewer reviews it, approve releases the funds, reject sends it back —
  and if the creator doesn't fix it in time, the money goes back to the donors,
  whoever they are (VC fund, angel, individual donors).

  - Milestone acceptance criteria on-chain: title, success definition, required
  proof, expected metrics, reporting period, proof deadline — reviewers evaluate
  against these, so criteria can't stay vague while evidence stays flexible.
  - Configurable approval authority per campaign: DesignatedReviewers (up to 7,
  with a threshold — so a 2-of-3 investment committee works), LeadDonor (largest
  donor, tracked live — the charity default), PlatformOperator (grant-admin
  style). DonorVote is scaffolded in the enum but reverts at creation.
  - Structured proof submissions: submitProof(summary, manifestHash, 
  manifestURI) records the package and never moves funds. Multiple submissions
  per milestone with full history.
  - Reject/revise loop: rejection requires notes, flips the milestone to
  ChangesRequested, and starts a 14-day revision window — after that (or after a
  missed proof deadline, or after reviewers go silent for 14 days on a
  submission), anyone can failCampaign and every donor claims a pro-rata refund 
  of the unreleased escrow via claimRefund. Creators can also voluntarily
  cancelCampaign. Refunds can't be double-claimed and never claw back
  legitimately released milestones.
  - Reputation fixed: only reviewer-approved milestones and completed campaigns
  score; raw submissions earn nothing.

  Evidence privacy boundary. On-chain: package hash + short public summary (+
  full package as a data-URI only if the creator opts in). Off-chain: the full
  manifest (write-up, justification, metrics, multiple links) lives in the
  indexer's new evidence registry (PUT/GET /evidence/:hash, which re-hashes
  bodies so it can't serve tampered content) with a localStorage fallback and a
  downloadable JSON for direct sharing. Reviewers' UI verifies the hash and
  shows an integrity badge. I did not fake access control — the current model is
  capability-by-hash, documented honestly, with the authenticated-storage seam
  marked in evidenceRegistry.ts.

  Frontend. Create flow rebuilt (campaign-type selector with smart approval
  defaults, per-milestone criteria editor, reviewer list + threshold, "Draft
  milestones for me" button); proof panel rebuilt (narrative + justification +
  metrics + multi-URL with add/remove + validation, public/private toggle,
  honest on-chain copy, social post explicitly separated from the proof record);
  new ReviewPanel (approve / reject-with-required-notes, threshold progress,
  manifest viewer, fail-campaign action); refund claiming in DonationPanel;
  milestone timeline with the new states (under review / changes requested /
  deadline missed); activity feed speaks the new events. The AI drafter is a
  typed adapter → API route with heuristic templates now and a single documented
  TODO(llm) seam for the Anthropic SDK later.

  Safety rails kept and strengthened. deploy.ts still validates USDC pre-deploy,
  and now also verifies post-deploy that usdc() matches, bytecode exists, and
  the exported frontend config matches the chain (including the new ABI
  functions). The frontend now refuses to write to any deployment whose ABI
  lacks the review flow.

  Verification done: 40 hardhat tests green · both packages typecheck · local
  node deploy → seed → live e2e: submit (no release) → reject (escrow locked,
  revision window set) → resubmit → approve (exact tranche released) → cancel →
  pro-rata refund claimed.

  Redeploy required — yes

  Storage layout and every write signature changed. The current Base contract
  (0x8845627E…) still runs auto-release; the app now treats it as read-only
  legacy until you say the word and I run yarn deploy:base (~$0.05 gas; old
  campaigns don't migrate — none hold funds). The EC2 frontend/indexer will also
  need their usual update afterward.

  Deferred (marked in docs/PROOF_REVIEW_ARCHITECTURE.md)

  Donor-wide voting; program-level approval config; authenticated evidence
  storage/RBAC/audit log; typed artifacts & file uploads; real LLM drafting;
  research issues 10 and 12.

  Known risks

  Milestones with no deadline have no timeout while still in Pending (the UI
  pushes deadlines; rejection and reviewer-silence timeouts apply regardless);
  the evidence registry is unlisted-not-private until auth lands; lead-donor
  authority shifts if someone donates more mid-review (by design, but worth
  knowing for the demo).

✻ Crunched for 30m 14s

※ recap: I rebuilt Covenant's escrow so milestone funds release only after reviewer approval, with rejections, deadlines, and donor refunds; contract, frontend, and tests are done and verified locally. Next action: redeploy to Base mainnet when you give the go-ahead.

❯ Yes, can you redeploy to base mainnet, please? Go do this.                    
                                                                                
  Also, can you make sure that you were able to connect your MetaMask wallet to 
  this app? I don't think the architecture is supporting that, because I was    
  looking at this and was testing it, and I can't connect my MetaMask wallet.   
  Is there something that is messed up in the contract? If so, can you please   
  fix that, because that's not a good thing for this to happen?                 
                                                                                
  The other thing is, do still include in the history tabs some examples of     
  what the old campaigns look like. Just keep the old campaigns from previous   
  contracts in just the history tab alone.                                      

⏺ Three workstreams: redeploy to Base, diagnose the MetaMask connection problem
  (I suspect the app config, not the contract — wallet connection never touches
  the contract), and multi-contract history. Let me gather the facts first:

  Ran 2 shell commands (ctrl+o to expand)

⏺ Wrong selector — let me compute it properly via viem:

  Ran 3 shell commands (ctrl+o to expand)

⏺ Struct shapes are compatible (the approval contract's milestone is a
  superset). Now the redeploy to Base mainnet:

  Ran 2 shell commands (ctrl+o to expand)

⏺ Update(~/Downloads/tracefund/packages/hardhat/scripts/deploy.ts)
  ⎿  Added 25 lines, removed 9 lines
       87    // Post-deploy verification: the immutable token baked into 
           the contract
       88    // must be exactly the address we validated above, and the c
           ontract itself
       89    // must have bytecode. Fail loudly rather than exporting a b
           roken config.
       90 -  const onChainUsdc = await covenant.usdc();                  
       91 -  if (onChainUsdc.toLowerCase() !== usdcAddress.toLowerCase())
          - {                                                            
       92 -    throw new Error(                                          
       93 -      `Deployed Covenant reports usdc()=${onChainUsdc}, expect
          -ed ${usdcAddress} — aborting export.`,                        
       94 -    );                                                        
       90 +  // Public RPCs are load-balanced and a node may lag the depl
          +oyment by a few                                               
       91 +  // seconds, so retry stale reads before concluding anything 
          +is wrong.                                                     
       92 +  let verified = false;                                       
       93 +  for (let attempt = 1; attempt <= 6 && !verified; attempt++) 
          +{                                                             
       94 +    try {                                                     
       95 +      const covenantCode = await ethers.provider.getCode(addre
          +ss);                                                          
       96 +      if (covenantCode === "0x") throw new Error("no bytecode 
          +yet");                                                        
       97 +      const onChainUsdc = await covenant.usdc();              
       98 +      if (onChainUsdc.toLowerCase() !== usdcAddress.toLowerCas
          +e()) {                                                        
       99 +        // A real mismatch, not propagation lag — abort immedi
          +ately.                                                        
      100 +        throw new Error(                                      
      101 +          `FATAL: deployed Covenant reports usdc()=${onChainUs
          +dc}, expected ${usdcAddress}`,                                
      102 +        );                                                    
      103 +      }                                                       
      104 +      verified = true;                                        
      105 +    } catch (err: any) {                                      
      106 +      if (String(err?.message).startsWith("FATAL")) throw err;
      107 +      if (attempt === 6) {                                    
      108 +        throw new Error(                                      
      109 +          `Could not verify the deployment after ${attempt} at
          +tempts (${err?.shortMessage ?? err?.message}) — aborting expor
          +t.`,                                                          
      110 +        );                                                    
      111 +      }                                                       
      112 +      console.log(`  verification read not propagated yet (att
          +empt ${attempt}) — retrying…`);                               
      113 +      await new Promise((r) => setTimeout(r, 5000));          
      114 +    }                                                         
      115    }
       96 -  const covenantCode = await ethers.provider.getCode(address);
       97 -  if (covenantCode === "0x") {                                
       98 -    throw new Error(`No bytecode at deployed Covenant address 
          -${address} — aborting export.`);                              
       99 -  }                                                           
      116    console.log(`  verified on-chain: usdc() matches, Covenant b
           ytecode present`);
      117  
      118    await exportToFrontend(chainId, address, deployBlock, usdcAd
           dress);

  Ran 1 shell command (ctrl+o to expand)

⏺ Wrong working directory — retrying from the hardhat package:

  Ran 1 shell command (ctrl+o to expand)

⏺ Write(lib/legacy.ts)
  ⎿  Added 128 lines, removed 20 lines
       3  import legacy from "../contracts/legacyContract.json";
       4  
       5  /**
       6 - * The retired TraceFund/Covenant deployment on Base Mainnet. I
         -t predates the                                                 
       7 - * USDC migration (amounts are ETH wei) and the auto-release fi
         -x, and is kept                                                 
       8 - * strictly read-only: the History tab shows its campaigns as a
         - permanent                                                     
       9 - * on-chain record, but the app never writes to it.            
       6 + * Retired TraceFund/Covenant deployments on Base Mainnet, kept
         + strictly                                                      
       7 + * read-only: the History tab shows their campaigns as a perman
         +ent on-chain                                                   
       8 + * record, but the app never writes to them. Every superseded c
         +ontract that                                                   
       9 + * ever held campaigns gets an entry here.                     
      10   */
      11 -export const LEGACY_CHAIN_ID: number = legacy.chainId;         
      12 -export const legacyAddress = legacy.address as `0x${string}`;  
      13 -export const legacyAbi = legacy.abi as Abi;                    
      14 -export const legacyDeployBlock = BigInt(legacy.deployBlock ?? 0
         -);                                                             
      11  
      16 -// Struct shapes of the retired deployment — frozen; do not evo
         -lve these with                                                 
      17 -// the live contract's types.                                  
      12 +export const LEGACY_CHAIN_ID = 8453;                           
      13 +                                                               
      14 +// Struct shapes shared by all retired deployments — frozen; do
         + not evolve                                                    
      15 +// these with the live contract's types. (The approval-era cont
         +ract returns a                                                 
      16 +// superset with extra milestone fields; viem decodes the extra
         +s harmlessly.)                                                 
      17  export interface LegacyMilestone {
      18    description: string;
      19    amount: bigint;
     ...
       38    milestoneCount: bigint;
       39  }
       40  
       41 +// Minimal read-only ABI for the auto-release-era contracts (E
          +TH and USDC                                                   
       42 +// variants share the same Campaign/Milestone tuple shapes).  
       43 +const CAMPAIGN_COMPONENTS = [                                 
       44 +  { name: "id", type: "uint256" },                            
       45 +  { name: "creator", type: "address" },                       
       46 +  { name: "title", type: "string" },                          
       47 +  { name: "description", type: "string" },                    
       48 +  { name: "goalAmount", type: "uint256" },                    
       49 +  { name: "totalRaised", type: "uint256" },                   
       50 +  { name: "totalReleased", type: "uint256" },                 
       51 +  { name: "active", type: "bool" },                           
       52 +  { name: "completed", type: "bool" },                        
       53 +  { name: "currentMilestone", type: "uint256" },              
       54 +  { name: "createdAt", type: "uint256" },                     
       55 +  { name: "donorCount", type: "uint256" },                    
       56 +  { name: "milestoneCount", type: "uint256" },                
       57 +] as const;                                                   
       58 +                                                              
       59 +const MILESTONE_COMPONENTS = [                                
       60 +  { name: "description", type: "string" },                    
       61 +  { name: "amount", type: "uint256" },                        
       62 +  { name: "evidence", type: "string" },                       
       63 +  { name: "evidenceSubmitted", type: "bool" },                
       64 +  { name: "released", type: "bool" },                         
       65 +] as const;                                                   
       66 +                                                              
       67 +const AUTORELEASE_READ_ABI = [                                
       68 +  {                                                           
       69 +    type: "function",                                         
       70 +    name: "getAllCampaigns",                                  
       71 +    stateMutability: "view",                                  
       72 +    inputs: [],                                               
       73 +    outputs: [{ name: "", type: "tuple[]", components: CAMPAIG
          +N_COMPONENTS }],                                              
       74 +  },                                                          
       75 +  {                                                           
       76 +    type: "function",                                         
       77 +    name: "getCampaign",                                      
       78 +    stateMutability: "view",                                  
       79 +    inputs: [{ name: "campaignId", type: "uint256" }],        
       80 +    outputs: [{ name: "", type: "tuple", components: CAMPAIGN_
          +COMPONENTS }],                                                
       81 +  },                                                          
       82 +  {                                                           
       83 +    type: "function",                                         
       84 +    name: "getMilestones",                                    
       85 +    stateMutability: "view",                                  
       86 +    inputs: [{ name: "campaignId", type: "uint256" }],        
       87 +    outputs: [{ name: "", type: "tuple[]", components: MILESTO
          +NE_COMPONENTS }],                                             
       88 +  },                                                          
       89 +] as const satisfies Abi;                                     
       90 +                                                              
       91 +export interface ArchivedDeployment {                         
       92 +  /** Stable slug used in /history/<key>-<campaignId> URLs. */
       93 +  key: string;                                                
       94 +  /** Short human label shown on cards. */                    
       95 +  label: string;                                              
       96 +  /** One-line context for why this contract is retired. */   
       97 +  note: string;                                               
       98 +  address: `0x${string}`;                                     
       99 +  abi: Abi;                                                   
      100 +  deployBlock: bigint;                                        
      101 +  /** Display denomination — the eras used different settlemen
          +t assets. */                                                  
      102 +  symbol: "ETH" | "USDC";                                     
      103 +  formatAmount: (units: bigint | undefined) => string;        
      104 +}                                                             
      105 +                                                              
      106 +function trimAmount(units: bigint | undefined, decimals: numbe
          +r, maxDigits: number): string {                               
      107 +  if (units === undefined) return "0";                        
      108 +  const full = formatUnits(units, decimals);                  
      109 +  if (!full.includes(".")) return full;                       
      110 +  const [whole, frac] = full.split(".");                      
      111 +  const trimmed = frac.slice(0, maxDigits).replace(/0+$/, "");
      112 +  return trimmed.length ? `${whole}.${trimmed}` : whole;      
      113 +}                                                             
      114 +                                                              
      115 +/** Legacy ETH-era campaigns were denominated in wei (18 decim
          +als). */                                                      
      116 +export function formatLegacyEth(wei: bigint | undefined, maxDi
          +gits = 10): string {                                          
      117 +  return trimAmount(wei, 18, maxDigits);                      
      118 +}                                                             
      119 +                                                              
      120 +export const archivedDeployments: ArchivedDeployment[] = [    
      121 +  {                                                           
      122 +    key: "approval",                                          
      123 +    label: "ETH · approval era",                              
      124 +    note: "The original ETH contract with donor approval votin
          +g.",                                                          
      125 +    address: legacy.address as `0x${string}`,                 
      126 +    abi: legacy.abi as Abi,                                   
      127 +    deployBlock: BigInt(legacy.deployBlock ?? 0),             
      128 +    symbol: "ETH",                                            
      129 +    formatAmount: (v) => formatLegacyEth(v),                  
      130 +  },                                                          
      131 +  {                                                           
      132 +    key: "eth",                                               
      133 +    label: "ETH · auto-release era",                          
      134 +    note: "The ETH contract that released funds automatically 
          +on proof submission.",                                        
      135 +    address: "0x9CA2E453462b87584f5A4D15f5962a4f2174BCE9",    
      136 +    abi: AUTORELEASE_READ_ABI,                                
      137 +    deployBlock: 48079282n,                                   
      138 +    symbol: "ETH",                                            
      139 +    formatAmount: (v) => formatLegacyEth(v),                  
      140 +  },                                                          
      141 +  {                                                           
      142 +    key: "usdc1",                                             
      143 +    label: "USDC · auto-release era",                         
      144 +    note: "The first USDC contract (retired: misconfigured tok
          +en, donations never worked).",                                
      145 +    address: "0xe11CE961Ff378B5D5172DE6ABfE8c16f900e10F3",    
      146 +    abi: AUTORELEASE_READ_ABI,                                
      147 +    deployBlock: 48139854n,                                   
      148 +    symbol: "USDC",                                           
      149 +    formatAmount: (v) => trimAmount(v, 6, 6),                 
      150 +  },                                                          
      151 +];                                                            
      152 +                                                              
      153 +export function getArchive(key?: string): ArchivedDeployment |
          + undefined {                                                  
      154 +  return archivedDeployments.find((a) => a.key === key);      
      155 +}                                                             
      156 +                                                              
      157 +/** Default archive (the one with the original demo campaigns)
          +. */                                                          
      158 +export const legacyAddress = archivedDeployments[0].address;  
      159 +                                                              
      160  export function legacyCampaignStatus(c: LegacyCampaign): { lab
           el: string; pill: string } {
      161    if (c.completed) {
      162      return {
     ...
      169      pill: "bg-[var(--bg-subtle)] text-[var(--text-tertiary)] r
           ing-1 ring-[var(--border-primary)]",
      170    };
      171  }
       54 -                                                              
       55 -/** Legacy campaigns were denominated in ETH (18 decimals), no
          -t USDC. */                                                    
       56 -export function formatLegacyEth(wei: bigint | undefined, maxDi
          -gits = 10): string {                                          
       57 -  if (wei === undefined) return "0";                          
       58 -  const full = formatUnits(wei, 18);                          
       59 -  if (!full.includes(".")) return full;                       
       60 -  const [whole, frac] = full.split(".");                      
       61 -  const trimmed = frac.slice(0, maxDigits).replace(/0+$/, "");
       62 -  return trimmed.length ? `${whole}.${trimmed}` : whole;      
       63 -}                                                             

⏺ Write(hooks/useLegacy.ts)
  ⎿  Added 37 lines, removed 19 lines
       1  "use client";
       2  
       3 -import { useReadContract } from "wagmi";                       
       3 +import { useReadContract, useReadContracts } from "wagmi";     
       4  import {
       5    LEGACY_CHAIN_ID,
       6 -  legacyAbi,                                                   
       7 -  legacyAddress,                                               
       6 +  archivedDeployments,                                         
       7 +  type ArchivedDeployment,                                     
       8    type LegacyCampaign,
       9    type LegacyMilestone,
      10  } from "../lib/legacy";
      11  
      12  /**
      13 - * Read hooks for the retired Base Mainnet contract shown in th
         -e History tab.                                                 
      13 + * Read hooks for the retired Base Mainnet contracts shown in t
         +he History tab.                                                
      14   * Always pinned to Base regardless of the connected wallet net
          work, and
      15   * read-only by construction — there is no legacy write hook.
      16   */
      17  
      18 -export function useLegacyCampaigns() {                         
      19 -  const q = useReadContract({                                  
      20 -    address: legacyAddress,                                    
      21 -    abi: legacyAbi,                                            
      22 -    functionName: "getAllCampaigns",                           
      23 -    chainId: LEGACY_CHAIN_ID,                                  
      18 +export interface ArchivedCampaign {                            
      19 +  archive: ArchivedDeployment;                                 
      20 +  campaign: LegacyCampaign;                                    
      21 +}                                                              
      22 +                                                               
      23 +/** Campaigns from EVERY archived deployment, tagged with their
         + source. */                                                    
      24 +export function useArchivedCampaigns() {                       
      25 +  const q = useReadContracts({                                 
      26 +    contracts: archivedDeployments.map((a) => ({               
      27 +      address: a.address,                                      
      28 +      abi: a.abi,                                              
      29 +      functionName: "getAllCampaigns",                         
      30 +      chainId: LEGACY_CHAIN_ID,                                
      31 +    })),                                                       
      32 +    allowFailure: true,                                        
      33    });
      25 -  return { ...q, campaigns: (q.data as LegacyCampaign[] | undef
         -ined) ?? [] };                                                 
      34 +                                                               
      35 +  const campaigns: ArchivedCampaign[] = (q.data ?? []).flatMap(
         +(result, i) => {                                               
      36 +    if (result.status !== "success") return [];                
      37 +    return (result.result as LegacyCampaign[]).map((campaign) =
         +> ({                                                           
      38 +      archive: archivedDeployments[i],                         
      39 +      campaign,                                                
      40 +    }));                                                       
      41 +  });                                                          
      42 +                                                               
      43 +  return { ...q, campaigns };                                  
      44  }
      45  
      28 -export function useLegacyCampaign(id?: bigint) {               
      46 +export function useLegacyCampaign(archive?: ArchivedDeployment,
         + id?: bigint) {                                                
      47    const q = useReadContract({
      30 -    address: legacyAddress,                                    
      31 -    abi: legacyAbi,                                            
      48 +    address: archive?.address,                                 
      49 +    abi: archive?.abi,                                         
      50      functionName: "getCampaign",
      51      args: id !== undefined ? [id] : undefined,
      52      chainId: LEGACY_CHAIN_ID,
      35 -    query: { enabled: id !== undefined },                      
      53 +    query: { enabled: !!archive && id !== undefined },         
      54    });
      55    return { ...q, campaign: q.data as LegacyCampaign | undefined
           };
      56  }
      57  
      40 -export function useLegacyMilestones(id?: bigint) {             
      58 +export function useLegacyMilestones(archive?: ArchivedDeploymen
         +t, id?: bigint) {                                              
      59    const q = useReadContract({
      42 -    address: legacyAddress,                                    
      43 -    abi: legacyAbi,                                            
      60 +    address: archive?.address,                                 
      61 +    abi: archive?.abi,                                         
      62      functionName: "getMilestones",
      63      args: id !== undefined ? [id] : undefined,
      64      chainId: LEGACY_CHAIN_ID,
      47 -    query: { enabled: id !== undefined },                      
      65 +    query: { enabled: !!archive && id !== undefined },         
      66    });
      67    return { ...q, milestones: (q.data as LegacyMilestone[] | und
          efined) ?? [] };
      68  }

  Read 1 file (ctrl+o to expand)

⏺ Write(app/history/page.tsx)
  ⎿  Added 33 lines, removed 21 lines
       2  
       3  import Link from "next/link";
       4  import { percent } from "../../lib/format";
       5 -import { formatLegacyEth, legacyAddress, type LegacyCampaign } 
         -from "../../lib/legacy";                                       
       6 -import { useLegacyCampaigns } from "../../hooks/useLegacy";    
       5 +import { archivedDeployments } from "../../lib/legacy";        
       6 +import { useArchivedCampaigns, type ArchivedCampaign } from "..
         +/../hooks/useLegacy";                                          
       7  import { campaignPhoto } from "../../lib/campaignImage";
       8  import { ProgressBar } from "../../components/ProgressBar";
       9  import { Address } from "../../components/Address";
      10  
      11  export default function HistoryPage() {
      12 -  const { campaigns, isLoading, isError } = useLegacyCampaigns(
         -);                                                             
      13 -  const list = [...campaigns].reverse(); // newest first       
      12 +  const { campaigns, isLoading } = useArchivedCampaigns();     
      13 +  const list = [...campaigns].reverse(); // newest era / newest
         + campaigns first                                               
      14  
      15    return (
      16      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      17        <div className="mb-6">
      18          <h1 className="text-2xl font-bold text-[var(--text-prim
          ary)]">Campaign history</h1>
      19          <p className="mt-1 text-sm text-[var(--text-secondary)]
          ">
      20 -          Campaigns from a previous version of the Covenant con
         -tract. Closed to new donations —                               
      20 +          Campaigns from previous versions of the Covenant cont
         +ract. Closed to new donations —                                
      21            shown here as their permanent on-chain record.
      22          </p>
      23        </div>
      24  
      25        <div className="mb-6 rounded-xl border border-[var(--bord
          er-primary)] bg-[var(--bg-faint)] px-4 py-3 text-sm text-[var(-
          -text-secondary)]">
      26 -        These campaigns ran in ETH on a retired contract (     
      27 -        <span className="font-mono text-xs">{legacyAddress}</sp
         -an> on Base). The upgraded                                     
      28 -        contract settles in USDC, so they are read-only — but e
         -very donation, proof, and release                              
      29 -        below is still independently verifiable on-chain.      
      26 +        <p>                                                    
      27 +          Covenant&apos;s contract has evolved (donor approval 
         +voting → auto-release → the current                            
      28 +          reviewer-gated USDC escrow). Each era below is a reti
         +red, read-only contract on Base —                              
      29 +          every donation, proof, and release is still independe
         +ntly verifiable on-chain.                                      
      30 +        </p>                                                   
      31 +        <ul className="mt-2 space-y-1 text-xs text-[var(--text-
         +tertiary)]">                                                   
      32 +          {archivedDeployments.map((a) => (                    
      33 +            <li key={a.key}>                                   
      34 +              <span className="font-medium text-[var(--text-sec
         +ondary)]">{a.label}</span>{" "}                                
      35 +              <span className="font-mono">{a.address}</span> — 
         +{a.note}                                                       
      36 +            </li>                                              
      37 +          ))}                                                  
      38 +        </ul>                                                  
      39        </div>
      40  
      41        {isLoading ? (
     ...
      44              <div key={i} className="card h-52 animate-pulse bg-
          [var(--surface-bg)]" />
      45            ))}
      46          </div>
      38 -      ) : isError ? (                                          
      47 +      ) : list.length === 0 ? (                                
      48          <p className="text-sm text-[var(--text-secondary)]">
      40 -          Could not load the archived campaigns from Base.     
      49 +          No archived campaigns could be loaded from Base.     
      50          </p>
      42 -      ) : list.length === 0 ? (                                
      43 -        <p className="text-sm text-[var(--text-secondary)]">No 
         -archived campaigns.</p>                                        
      51        ) : (
      52          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-
          3">
      46 -          {list.map((c) => (                                   
      47 -            <LegacyCampaignCard key={c.id.toString()} campaign=
         -{c} />                                                         
      53 +          {list.map((entry) => (                               
      54 +            <LegacyCampaignCard                                
      55 +              key={`${entry.archive.key}-${entry.campaign.id.to
         +String()}`}                                                    
      56 +              entry={entry}                                    
      57 +            />                                                 
      58            ))}
      59          </div>
      60        )}
     ...
      62    );
      63  }
      64  
      55 -function LegacyCampaignCard({ campaign }: { campaign: LegacyCam
         -paign }) {                                                     
      65 +function LegacyCampaignCard({ entry }: { entry: ArchivedCampaig
         +n }) {                                                         
      66 +  const { archive, campaign } = entry;                         
      67    const raisedPct = percent(campaign.totalRaised, campaign.goal
          Amount);
      68    const shown = campaign.completed ? campaign.milestoneCount : 
          campaign.currentMilestone + 1n;
      69 +  const amount = archive.formatAmount;                         
      70  
      71    return (
      72      <Link
      61 -      href={`/history/${campaign.id}`}                         
      73 +      href={`/history/${archive.key}-${campaign.id.toString()}`
         +}                                                              
      74        className="card group flex flex-col overflow-hidden trans
          ition hover:-translate-y-0.5 hover:border-[var(--brand-primary)
          ]/40 hover:shadow-[0_1px_4px_rgba(0,0,0,0.06),0_4px_16px_rgba(0
          ,0,0,0.04)]"
      75      >
      76        <div className="relative h-[120px] overflow-hidden">
     ...
      84            className="absolute inset-0"
      85            style={{ background: "linear-gradient(to bottom, tran
          sparent 40%, rgba(0,0,0,0.3))" }}
      86          />
      75 -        <div className="absolute left-4 top-4 rounded-full bg-w
         -hite/90 p-0.5 backdrop-blur-sm">                               
      87 +        <div className="absolute left-4 top-4 flex gap-1 rounde
         +d-full bg-white/90 p-0.5 backdrop-blur-sm">                    
      88            <span className="pill bg-[var(--bg-subtle)] text-[var
          (--text-secondary)] ring-1 ring-[var(--border-primary)]">
      77 -            Archived                                           
      89 +            {archive.label}                                    
      90            </span>
      91          </div>
      92        </div>
     ...
      104          <div className="space-y-2">
      105            <div className="flex items-baseline justify-between 
           text-sm">
      106              <span className="font-mono font-semibold text-[var
           (--text-primary)]">
       95 -              {formatLegacyEth(campaign.totalRaised)} ETH     
      107 +              {amount(campaign.totalRaised)} {archive.symbol} 
      108              </span>
      109              <span className="text-[var(--text-tertiary)]">
       98 -              of {formatLegacyEth(campaign.goalAmount)} ETH   
      110 +              of {amount(campaign.goalAmount)} {archive.symbol
          +}                                                             
      111              </span>
      112            </div>
      113            <ProgressBar value={raisedPct} />

  Read 1 file (ctrl+o to expand)
⏺ Write(app/history/[id]/page.tsx)
  ⎿  Added 44 lines, removed 20 lines
       4  import { useParams } from "next/navigation";
       5  import { percent } from "../../../lib/format";
       6  import {
       7 -  formatLegacyEth,                                             
       8 -  legacyAddress,                                               
       7 +  getArchive,                                                  
       8    legacyCampaignStatus,
       9 +  type ArchivedDeployment,                                     
      10    type LegacyMilestone,
      11  } from "../../../lib/legacy";
      12  import { useLegacyCampaign, useLegacyMilestones } from "../../.
          ./hooks/useLegacy";
     ...
      16  import { ProgressBar } from "../../../components/ProgressBar";
      17  import { EvidenceLink } from "../../../components/EvidenceLink"
          ;
      18  
      19 +/**                                                            
      20 + * Archived campaign detail. Route param is "<archiveKey>-<camp
         +aignId>",                                                      
      21 + * e.g. /history/approval-3 — plain numeric ids resolve against
         + the original                                                  
      22 + * approval-era contract so old links keep working.            
      23 + */                                                            
      24  export default function LegacyCampaignDetailPage() {
      25    const params = useParams();
      26    const raw = Array.isArray(params.id) ? params.id[0] : params.
          id;
      27 +                                                               
      28 +  let archive: ArchivedDeployment | undefined;                 
      29    let id: bigint | undefined;
      23 -  try {                                                        
      24 -    id = raw !== undefined ? BigInt(raw) : undefined;          
      25 -  } catch {                                                    
      26 -    id = undefined;                                            
      30 +  if (raw !== undefined) {                                     
      31 +    const match = /^(?:([a-z0-9]+)-)?(\d+)$/.exec(raw);        
      32 +    if (match) {                                               
      33 +      archive = getArchive(match[1] ?? "approval");            
      34 +      try {                                                    
      35 +        id = BigInt(match[2]);                                 
      36 +      } catch {                                                
      37 +        id = undefined;                                        
      38 +      }                                                        
      39 +    }                                                          
      40    }
      41  
      29 -  const { campaign, isLoading, isError } = useLegacyCampaign(id
         -);                                                             
      30 -  const { milestones } = useLegacyMilestones(id);              
      42 +  const { campaign, isLoading, isError } = useLegacyCampaign(ar
         +chive, id);                                                    
      43 +  const { milestones } = useLegacyMilestones(archive, id);     
      44  
      32 -  if (id === undefined) {                                      
      45 +  if (!archive || id === undefined) {                          
      46      return <CenteredMessage title="Invalid campaign" body="That
           campaign id is not valid." />;
      47    }
      48    if (isError) {
     ...
      64    const status = legacyCampaignStatus(campaign);
      65    const raisedPct = percent(campaign.totalRaised, campaign.goal
          Amount);
      66    const inEscrow = campaign.totalRaised - campaign.totalRelease
          d;
      67 +  const amount = archive.formatAmount;                         
      68 +  const symbol = archive.symbol;                               
      69  
      70    return (
      71      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
     ...
      87              style={{ background: "linear-gradient(to top, rgba(
          0,0,0,0.5) 0%, transparent 60%)" }}
      88            />
      89            <div className="absolute bottom-4 left-6 flex flex-wr
          ap items-center gap-2">
      75 -            <span className="pill bg-white/90 text-[var(--text-
         -secondary)]">Archived</span>                                   
      90 +            <span className="pill bg-white/90 text-[var(--text-
         +secondary)]">{archive.label}</span>                            
      91              <span className={`pill ${status.pill}`}>{status.lab
          el}</span>
      92              <span className="ml-1 text-xs text-white/60">
      93                by <Address address={campaign.creator} className=
          "text-white/80" />
     ...
      101  
      102            {/* Read-only notice — this deployment is retired, n
           ever write to it. */}
      103            <div className="mt-5 rounded-xl border border-[var(-
           -border-primary)] bg-[var(--bg-faint)] px-4 py-3 text-sm text-
           [var(--text-secondary)]">
       89 -            This campaign ran in ETH on a previous version of 
          -the Covenant contract (                                       
       90 -            <span className="font-mono text-xs">{legacyAddress
          -}</span> on Base) and is closed to                            
       91 -            new donations. Everything shown is its permanent o
          -n-chain record.                                               
      104 +            This campaign ran in {symbol} on a previous versio
          +n of the Covenant contract (                                  
      105 +            <span className="font-mono text-xs">{archive.addre
          +ss}</span> on Base) and is closed to                          
      106 +            new donations. {archive.note} Everything shown is 
          +its permanent on-chain record.                                
      107            </div>
      108  
      109            {/* Stats */}
      110            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-
           cols-3 lg:grid-cols-6">
       96 -            <Stat label="Raised" value={formatLegacyEth(campai
          -gn.totalRaised)} sub="ETH" accent />                          
       97 -            <Stat label="Goal" value={formatLegacyEth(campaign
          -.goalAmount)} sub="ETH" />                                    
       98 -            <Stat label="Released" value={formatLegacyEth(camp
          -aign.totalReleased)} sub="ETH" />                             
       99 -            <Stat label="Unreleased" value={formatLegacyEth(in
          -Escrow)} sub="ETH" />                                         
      111 +            <Stat label="Raised" value={amount(campaign.totalR
          +aised)} sub={symbol} accent />                                
      112 +            <Stat label="Goal" value={amount(campaign.goalAmou
          +nt)} sub={symbol} />                                          
      113 +            <Stat label="Released" value={amount(campaign.tota
          +lReleased)} sub={symbol} />                                   
      114 +            <Stat label="Unreleased" value={amount(inEscrow)} 
          +sub={symbol} />                                               
      115              <Stat label="Donors" value={campaign.donorCount.to
           String()} />
      116              <Stat
      117                label="Milestones"
     ...
      134          <h2 className="mb-3 text-lg font-semibold text-[var(--
           text-primary)]">Milestones</h2>
      135          <ol className="relative space-y-3">
      136            {milestones.map((m, i) => (
      122 -            <LegacyMilestoneRow key={i} milestone={m} index={i
          -} milestones={milestones} />                                  
      137 +            <LegacyMilestoneRow                               
      138 +              key={i}                                         
      139 +              milestone={m}                                   
      140 +              index={i}                                       
      141 +              milestones={milestones}                         
      142 +              archive={archive}                               
      143 +            />                                                
      144            ))}
      145          </ol>
      146        </section>
     ...
      152    milestone: m,
      153    index: i,
      154    milestones,
      155 +  archive,                                                    
      156  }: {
      157    milestone: LegacyMilestone;
      158    index: number;
      159    milestones: LegacyMilestone[];
      160 +  archive: ArchivedDeployment;                                
      161  }) {
      162    const cumTarget = milestones.slice(0, i + 1).reduce((s, x) =
           > s + x.amount, 0n);
      163 +  const amount = archive.formatAmount;                        
      164    return (
      165      <li className="card relative p-4">
      166        <div className="flex items-start gap-3">
     ...
      179              <p className="font-medium text-[var(--text-primary
           )]">{m.description}</p>
      180              <div className="flex items-center gap-2">
      181                <span className="text-xs text-[var(--text-tertia
           ry)]">
      158 -                at {formatLegacyEth(cumTarget)} ETH           
      182 +                at {amount(cumTarget)} {archive.symbol}       
      183                </span>
      184                <span className="font-mono text-sm font-semibold
            text-[var(--brand-primary)]">
      161 -                +{formatLegacyEth(m.amount)} ETH              
      185 +                +{amount(m.amount)} {archive.symbol}          
      186                </span>
      187              </div>
      188            </div>

⏺ Update(lib/wagmi.ts)
  ⎿  Added 7 lines, removed 3 lines
      24  };
      25  
      26  // Put the configured default chain (NEXT_PUBLIC_DEFAULT_CHAIN_
          ID, e.g. 8453 = Base)
      27 -// first so the wallet modal and RainbowKit's initial chain pre
         -fer it.                                                        
      27 +// first so the wallet modal and RainbowKit's initial chain pre
         +fer it. Use the                                                
      28 +// env value directly — contract.ts's defaultChainId can fall b
         +ack to localhost                                               
      29 +// when the target chain's deployment is stale, and the wallet 
         +must never be                                                  
      30 +// steered to a localhost chain on a hosted site.              
      31 +const preferredChainId = Number(process.env.NEXT_PUBLIC_DEFAULT
         +_CHAIN_ID) || defaultChainId;                                  
      32  const ordered = [
      29 -  ...ALL_CHAINS.filter((c) => c.id === defaultChainId),        
      30 -  ...ALL_CHAINS.filter((c) => c.id !== defaultChainId),        
      33 +  ...ALL_CHAINS.filter((c) => c.id === preferredChainId),      
      34 +  ...ALL_CHAINS.filter((c) => c.id !== preferredChainId),      
      35  ] as [Chain, ...Chain[]];
      36  
      37  const transports = Object.fromEntries(ALL_CHAINS.map((c) => [c.
          id, http(RPC_OVERRIDES[c.id])]));

  Searched for 1 pattern, called claude-in-chrome, ran 2 shell commands (ctrl+o to expand)

⏺ The Chrome extension isn't connected right now, so I can't drive your browser
  directly. Let me verify the app serves correctly and diagnose from the running
  server instead:

  Ran 5 shell commands (ctrl+o to expand)

⏺ Background command "Start Next.js dev server" completed (exit code 0)

⏺ Current code is now live on localhost:3000. Trying the browser once more to
  test the connect flow end-to-end:

  Called claude-in-chrome, ran 1 shell command (ctrl+o to expand)

⏺ All routes serve cleanly. Updating memory with the new deployment, then
  summarizing:

  Wrote 3 memories (ctrl+o to expand)

⏺ All three requests are done. Here's the rundown:

  1. Redeployed to Base mainnet ✅

  The new review-flow Covenant is live at
  0xB31D06627E249282Ec2a7e17efcebae55F934F29 (block 48208634), constructed with
  the real USDC and verified on-chain (usdc() reads back correct, 21KB of
  bytecode, zero campaigns). The frontend config is exported and verified, so
  Base mainnet is the app's active write chain again.

  One deploy-time hiccup worth knowing about: the deploy succeeded but my
  post-deploy verification initially read through a lagging public RPC node that
  hadn't seen the contract yet, so the script aborted before exporting. I
  confirmed the deployment was fine on-chain, completed the export separately
  (no second deploy, no wasted gas), and hardened deploy.ts to retry stale reads
  for next time.

  2. The MetaMask issue — found, and it wasn't the contract

  To be direct about your question: wallet connection never touches the 
  contract. Connecting MetaMask is purely between the browser extension and the
  app's wallet config (RainbowKit/wagmi) — a contract can't break it, and I
  audited the wallet config anyway: valid WalletConnect project ID, MetaMask
  connector present, Base listed first.

  What I actually found: a stale production server was squatting on 
  localhost:3000, serving an old build of the app (from before yesterday's USDC
  fix and today's rebuild). That's almost certainly what you were testing
  against. I stopped it and started a fresh dev server on localhost:3000 running
  the current code — all pages compile and serve with zero errors.

  I tried to click through the connect flow in your Chrome myself, but the
  Claude browser extension isn't connected right now, so I couldn't operate the
  browser. Please retest at http://localhost:3000 now. If Connect still fails,
  tell me exactly what you see (does the wallet modal open? is MetaMask listed?
  any error text?) and reconnect the Chrome extension (restart Chrome if needed)
  — then I can drive the flow myself and pin it down. Note the EC2-hosted site
  still runs old code, so test locally, not on the server IP.

  3. History tab now archives all previous contracts ✅

  The History tab previously showed only the original approval-era ETH contract.
  It now shows every retired contract that ever held campaigns, each clearly
  labeled with its era and read-only:

  - ETH · approval era (0x000f8e23…) — 8 campaigns, the original donor-voting
  contract
  - ETH · auto-release era (0x9CA2E453…) — 1 campaign
  - USDC · auto-release era (0xe11CE961…) — 2 campaigns, noted as retired due to
  the token misconfiguration

  Amounts render in each era's own denomination (ETH vs USDC), detail pages live
  at /history/<era>-<id> (old numeric links still resolve to the approval
  contract), and none of these appear anywhere except History. The superseded
  0x8845627E contract has zero campaigns, so there's nothing to archive from it.

  Still outstanding: the EC2 deployment (frontend rebuild + indexer .env pointed
  at 0xB31D06627E…, deploy block 48208634) whenever you want the hosted demo
  updated.

✻ Worked for 11m 57s

※ recap: We rebuilt Covenant around reviewer-approved milestone releases with refunds, deployed it to Base mainnet, and added all old contracts to the History tab. Next: retest MetaMask connect at localhost:3000, which now runs the current code.