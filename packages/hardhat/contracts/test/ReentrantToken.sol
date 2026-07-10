// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title ReentrantToken
 * @notice A malicious ERC-20 used ONLY in tests. On every `transfer` it can
 *         attempt to re-enter a preset target (e.g. Covenant.claimRefund) before
 *         moving balances, simulating a token-driven reentrancy attack against
 *         an escrow that pays out in this token. Not deployed to any network.
 */
contract ReentrantToken is ERC20 {
    address public attackTarget;
    bytes public attackData;
    bool public armed;

    bool private _entered;
    bool public reentryAttempted;
    bool public reentrySucceeded;

    constructor() ERC20("Reentrant USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Arm the reentrancy: the next transfer will call target.call(data).
    function arm(address target, bytes calldata data) external {
        attackTarget = target;
        attackData = data;
        armed = true;
    }

    function _maybeReenter() internal {
        if (armed && !_entered) {
            _entered = true;
            reentryAttempted = true;
            // Swallow the failure so the outer (legitimate) transfer still
            // completes; the test asserts the reentry did NOT succeed.
            (bool ok, ) = attackTarget.call(attackData);
            reentrySucceeded = ok;
            _entered = false;
        }
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        _maybeReenter();
        return super.transfer(to, amount);
    }
}
