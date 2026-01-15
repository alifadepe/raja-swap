// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {RajaSwap} from "../src/RajaSwap.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract RajaSwapTest is Test {
    RajaSwap public swap;
    MockERC20 public tokenZ; // Sell Token
    MockERC20 public tokenX; // Buy Token

    uint256 internal makerPrivateKey;
    address internal maker;
    address internal taker;

    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address maker,address tokenSell,uint256 amountSell,address tokenBuy,uint256 amountBuy,uint256 nonce,uint256 deadline,address desiredTaker)"
    );

    function setUp() public {
        swap = new RajaSwap();
        tokenZ = new MockERC20("Token Z", "TKZ");
        tokenX = new MockERC20("Token X", "TKX");

        makerPrivateKey = 0xA11CE;
        maker = vm.addr(makerPrivateKey);
        taker = address(0xB0B);

        // Mint tokens
        tokenZ.mint(maker, 1000 ether);
        tokenX.mint(taker, 1000 ether);

        // Approvals
        vm.prank(maker);
        tokenZ.approve(address(swap), type(uint256).max);

        vm.prank(taker);
        tokenX.approve(address(swap), type(uint256).max);
    }

    function _signOrder(RajaSwap.Order memory order) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                order.maker,
                order.tokenSell,
                order.amountSell,
                order.tokenBuy,
                order.amountBuy,
                order.nonce,
                order.deadline,
                order.desiredTaker
            )
        );

        bytes32 domainSeparator = _getDomainSeparator();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPrivateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_FillOrder_Success() public {
        RajaSwap.Order memory order = RajaSwap.Order({
            maker: maker,
            tokenSell: address(tokenZ),
            amountSell: 100 ether,
            tokenBuy: address(tokenX),
            amountBuy: 500 ether,
            nonce: 1,
            deadline: block.timestamp + 1 hours,
            desiredTaker: address(0)
        });

        bytes memory signature = _signOrder(order);

        uint256 makerBalanceBefore = tokenX.balanceOf(maker);
        uint256 treasuryBalanceBefore = tokenX.balanceOf(address(swap));

        vm.prank(taker);
        swap.fillOrder(order, signature, order.amountBuy); // Fill full amount

        // Verification
        // Fee = 500 * 0.001 = 0.5 ether
        uint256 expectedFee = 0.5 ether;

        assertEq(tokenX.balanceOf(address(swap)), treasuryBalanceBefore + expectedFee, "Treasury should receive fee");
        assertEq(tokenX.balanceOf(maker), makerBalanceBefore + 499.5 ether, "Maker should receive remainder");
        assertEq(tokenZ.balanceOf(taker), 100 ether, "Taker should receive Token Z");
    }

    function test_FillOrder_Private_Success() public {
        RajaSwap.Order memory order = RajaSwap.Order({
            maker: maker,
            tokenSell: address(tokenZ),
            amountSell: 10 ether,
            tokenBuy: address(tokenX),
            amountBuy: 50 ether,
            nonce: 2,
            deadline: block.timestamp + 1 hours,
            desiredTaker: taker
        });

        bytes memory signature = _signOrder(order);

        vm.prank(taker);
        swap.fillOrder(order, signature, order.amountBuy);

        bytes32 orderHash = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), _getStructHash(order)));
        assertEq(swap.filledAmount(orderHash), order.amountBuy);
    }

    function test_FillOrder_Private_Revert() public {
        address otherUser = address(0xDEAD);
        tokenX.mint(otherUser, 1000 ether);
        vm.prank(otherUser);
        tokenX.approve(address(swap), 1000 ether);

        RajaSwap.Order memory order = RajaSwap.Order({
            maker: maker,
            tokenSell: address(tokenZ),
            amountSell: 10 ether,
            tokenBuy: address(tokenX),
            amountBuy: 50 ether,
            nonce: 3,
            deadline: block.timestamp + 1 hours,
            desiredTaker: taker // Only Taker can fill
        });

        bytes memory signature = _signOrder(order);

        vm.prank(otherUser);
        // Expect Custom Error: UnauthorizedTaker(address expected, address actual)
        vm.expectRevert(abi.encodeWithSelector(RajaSwap.UnauthorizedTaker.selector, taker, otherUser));
        swap.fillOrder(order, signature, order.amountBuy);
    }

    function test_WithdrawFees() public {
        // First generic fill to generate fees
        test_FillOrder_Success();

        uint256 feeAmount = 0.5 ether;
        assertEq(tokenX.balanceOf(address(swap)), feeAmount);

        // Owner withdraw
        // Any user can call it, but funds go to owner
        address contractOwner = swap.owner();

        uint256 withdrawAmount = 0.2 ether;
        vm.prank(taker); // Taker (anyone) triggers the withdraw
        swap.withdrawFees(address(tokenX), withdrawAmount);

        assertEq(tokenX.balanceOf(contractOwner), withdrawAmount);
        assertEq(tokenX.balanceOf(address(swap)), feeAmount - withdrawAmount);
    }

    function test_Pause() public {
        RajaSwap.Order memory order = RajaSwap.Order({
            maker: maker,
            tokenSell: address(tokenZ),
            amountSell: 10 ether,
            tokenBuy: address(tokenX),
            amountBuy: 50 ether,
            nonce: 4,
            deadline: block.timestamp + 1 hours,
            desiredTaker: address(0)
        });
        bytes memory signature = _signOrder(order);

        // Pause contract
        swap.pause();

        vm.prank(taker);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        swap.fillOrder(order, signature, order.amountBuy);

        // Unpause and success
        swap.unpause();
        vm.prank(taker);
        swap.fillOrder(order, signature, order.amountBuy);
        
        bytes32 orderHash = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), _getStructHash(order)));
        assertEq(swap.filledAmount(orderHash), order.amountBuy);
    }

    // Unexposed helpers needed for assertion/debug manually
    function _getDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("RajaSwap")),
                keccak256(bytes("1")),
                block.chainid,
                address(swap)
            )
        );
    }

    function _getStructHash(RajaSwap.Order memory order) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                order.maker,
                order.tokenSell,
                order.amountSell,
                order.tokenBuy,
                order.amountBuy,
                order.nonce,
                order.deadline,
                order.desiredTaker
            )
        );
    }

    function test_FillOrder_NoDeadline_Success() public {
        RajaSwap.Order memory order = RajaSwap.Order({
            maker: maker,
            tokenSell: address(tokenZ),
            amountSell: 10 ether,
            tokenBuy: address(tokenX),
            amountBuy: 50 ether,
            nonce: 5,
            deadline: 0, // No deadline
            desiredTaker: address(0)
        });

        bytes memory signature = _signOrder(order);

        // Advance time to ensure check would fail if 0 wasn't ignored
        vm.warp(block.timestamp + 365 days);

        vm.prank(taker);
        swap.fillOrder(order, signature, order.amountBuy);

        bytes32 orderHash = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), _getStructHash(order)));
        assertEq(swap.filledAmount(orderHash), order.amountBuy);
    }

    function test_FillOrder_Revert_AlreadyFilled() public {
        RajaSwap.Order memory order = RajaSwap.Order({
            maker: maker,
            tokenSell: address(tokenZ),
            amountSell: 10 ether,
            tokenBuy: address(tokenX),
            amountBuy: 50 ether,
            nonce: 7, // Unique nonce
            deadline: block.timestamp + 1 hours,
            desiredTaker: address(0)
        });

        bytes memory signature = _signOrder(order);

        // 1. Fill first time (should succeed)
        vm.prank(taker);
        swap.fillOrder(order, signature, order.amountBuy);

        // 2. Try to fill again (should revert)
        // OrderOverfilled(uint256 remaining, uint256 requested)
        // remaining = 0, requested = order.amountBuy
        vm.prank(taker);
        vm.expectRevert(abi.encodeWithSelector(RajaSwap.OrderOverfilled.selector, 0, order.amountBuy));
        swap.fillOrder(order, signature, order.amountBuy);
    }

    function test_setFeeBps_Success() public {
        uint256 newFee = 50; // 0.5%

        vm.expectEmit(true, true, true, true);
        emit RajaSwap.FeeBpsUpdated(10, newFee); // Default is 10

        swap.setFeeBps(newFee);
        assertEq(swap.feeBps(), newFee);
    }

    function test_setFeeBps_Revert_Unauthorized() public {
        vm.prank(taker);
        // OZ 5.0 Ownable error
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, taker));
        swap.setFeeBps(20);
    }

    function test_setFeeBps_Revert_InvalidFee() public {
        uint256 invalidFee = 1001; // > 10%
        vm.expectRevert(abi.encodeWithSelector(RajaSwap.InvalidFee.selector, invalidFee));
        swap.setFeeBps(invalidFee);
    }

    function test_FillOrder_Revert_Cancelled() public {
        RajaSwap.Order memory order = RajaSwap.Order({
            maker: maker,
            tokenSell: address(tokenZ),
            amountSell: 10 ether,
            tokenBuy: address(tokenX),
            amountBuy: 50 ether,
            nonce: 8,
            deadline: block.timestamp + 1 hours,
            desiredTaker: address(0)
        });

        bytes memory signature = _signOrder(order);

        // 1. Cancel the nonce
        vm.prank(maker);
        swap.cancelOrder(order.nonce);

        // 2. Try to fill (should revert)
        bytes32 orderHash = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), _getStructHash(order)));

        vm.prank(taker);
        vm.expectRevert(abi.encodeWithSelector(RajaSwap.OrderCancelled.selector, orderHash));
        swap.fillOrder(order, signature, order.amountBuy);
    }

    function test_FillOrder_NewFee() public {
        // 1. Update Fee to 2% (200 bps)
        swap.setFeeBps(200);

        RajaSwap.Order memory order = RajaSwap.Order({
            maker: maker,
            tokenSell: address(tokenZ),
            amountSell: 100 ether,
            tokenBuy: address(tokenX),
            amountBuy: 500 ether,
            nonce: 6,
            deadline: block.timestamp + 1 hours,
            desiredTaker: address(0)
        });

        bytes memory signature = _signOrder(order);

        uint256 makerBalanceBefore = tokenX.balanceOf(maker);
        uint256 treasuryBalanceBefore = tokenX.balanceOf(address(swap));

        vm.prank(taker);
        swap.fillOrder(order, signature, order.amountBuy);

        // Verification
        // Fee = 500 * 0.02 = 10 ether
        uint256 expectedFee = 10 ether;

        assertEq(
            tokenX.balanceOf(address(swap)), treasuryBalanceBefore + expectedFee, "Treasury should receive new fee"
        );
        assertEq(
            tokenX.balanceOf(maker),
            makerBalanceBefore + (500 ether - expectedFee),
            "Maker should receive remainder after new fee"
        );
    }
}
