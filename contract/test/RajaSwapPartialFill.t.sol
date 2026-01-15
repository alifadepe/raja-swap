// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {RajaSwap} from "../src/RajaSwap.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract RajaSwapPartialFillTest is Test {
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

    function test_PartialFill_50Percent() public {
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

        uint256 amountToFill = 250 ether; // 50%
        
        vm.prank(taker);
        swap.fillOrder(order, signature, amountToFill);

        // Verify balances
        // Taker spent 250 tokenX + fee
        // Fee = 250 * 0.001 = 0.25
        uint256 expectedFee = 0.25 ether;
        
        // Assertions
        assertEq(tokenX.balanceOf(address(swap)), expectedFee, "Fee incorrect");
        assertEq(tokenX.balanceOf(maker), 250 ether - expectedFee, "Maker received incorrect amount");
        assertEq(tokenZ.balanceOf(taker), 50 ether, "Taker received incorrect percentage of sell token");
        
        bytes32 orderHash = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), _getStructHash(order)));
        assertEq(swap.filledAmount(orderHash), 250 ether, "Filled amount state incorrect");
    }

    function test_PartialFill_TwoSteps() public {
        RajaSwap.Order memory order = RajaSwap.Order({
            maker: maker,
            tokenSell: address(tokenZ),
            amountSell: 100 ether,
            tokenBuy: address(tokenX),
            amountBuy: 500 ether,
            nonce: 2,
            deadline: block.timestamp + 1 hours,
            desiredTaker: address(0)
        });

        bytes memory signature = _signOrder(order);
        bytes32 orderHash = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), _getStructHash(order)));

        // Step 1: Fill 20% (100 ether)
        vm.prank(taker);
        swap.fillOrder(order, signature, 100 ether);
        assertEq(swap.filledAmount(orderHash), 100 ether);

        // Step 2: Fill remaining 80% (400 ether)
        vm.prank(taker);
        swap.fillOrder(order, signature, 400 ether);
        assertEq(swap.filledAmount(orderHash), 500 ether);

        // Verify total executed correctly
        assertEq(tokenZ.balanceOf(taker), 100 ether); // Received full sell amount
    }

    function test_PartialFill_Revert_Overfill() public {
        RajaSwap.Order memory order = RajaSwap.Order({
            maker: maker,
            tokenSell: address(tokenZ),
            amountSell: 100 ether,
            tokenBuy: address(tokenX),
            amountBuy: 500 ether,
            nonce: 3,
            deadline: block.timestamp + 1 hours,
            desiredTaker: address(0)
        });

        bytes memory signature = _signOrder(order);

        // Try to fill 501 ether
        vm.prank(taker);
        vm.expectRevert(abi.encodeWithSelector(RajaSwap.OrderOverfilled.selector, 500 ether, 501 ether));
        swap.fillOrder(order, signature, 501 ether);
    }

    function test_PartialFill_Revert_ZeroAmount() public {
         RajaSwap.Order memory order = RajaSwap.Order({
            maker: maker,
            tokenSell: address(tokenZ),
            amountSell: 100 ether,
            tokenBuy: address(tokenX),
            amountBuy: 500 ether,
            nonce: 4,
            deadline: block.timestamp + 1 hours,
            desiredTaker: address(0)
        });

        bytes memory signature = _signOrder(order);

        vm.prank(taker);
        vm.expectRevert(RajaSwap.InvalidAmount.selector);
        swap.fillOrder(order, signature, 0);       
    }

    function test_PartialFill_Revert_DoubleFill() public {
         RajaSwap.Order memory order = RajaSwap.Order({
            maker: maker,
            tokenSell: address(tokenZ),
            amountSell: 100 ether,
            tokenBuy: address(tokenX),
            amountBuy: 500 ether,
            nonce: 5,
            deadline: block.timestamp + 1 hours,
            desiredTaker: address(0)
        });

        bytes memory signature = _signOrder(order);

        // Fill 100%
        vm.prank(taker);
        swap.fillOrder(order, signature, 500 ether);

        // Fill another 1 wei
        vm.prank(taker);
        vm.expectRevert(abi.encodeWithSelector(RajaSwap.OrderOverfilled.selector, 0, 1));
        swap.fillOrder(order, signature, 1);     
    }
}
