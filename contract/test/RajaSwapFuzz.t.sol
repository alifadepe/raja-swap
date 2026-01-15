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

contract RajaSwapFuzzTest is Test {
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
        tokenZ.mint(maker, 1000000 ether);
        tokenX.mint(taker, 1000000 ether);

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

        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("RajaSwap")),
                keccak256(bytes("1")),
                block.chainid,
                address(swap)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPrivateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_Fuzz_FillOrder(uint256 amountToFill) public {
        // Bound amountToFill to be between 1 and a reasonable large amount (e.g., 500 ether)
        // We'll set the order size to 1000 ether to allow full or partial fills
        uint256 orderBuyAmount = 1000 ether;
        amountToFill = bound(amountToFill, 1, orderBuyAmount);

        RajaSwap.Order memory order = RajaSwap.Order({
            maker: maker,
            tokenSell: address(tokenZ),
            amountSell: 100 ether,
            tokenBuy: address(tokenX),
            amountBuy: orderBuyAmount,
            nonce: 1,
            deadline: block.timestamp + 1 hours,
            desiredTaker: address(0)
        });

        bytes memory signature = _signOrder(order);

        uint256 treasuryBalanceBefore = tokenX.balanceOf(address(swap));
        uint256 makerBalanceBefore = tokenX.balanceOf(maker);
        
        vm.prank(taker);
        swap.fillOrder(order, signature, amountToFill);

        // Calculate expected values
        uint256 fee = (amountToFill * swap.feeBps()) / 10000;
        uint256 makerAmount = amountToFill - fee;
        uint256 amountSellTransferred = (amountToFill * order.amountSell) / order.amountBuy;

        // Verify balances
        assertEq(tokenX.balanceOf(address(swap)), treasuryBalanceBefore + fee, "Treasury should receive correct fee");
        assertEq(tokenX.balanceOf(maker), makerBalanceBefore + makerAmount, "Maker should receive correct amount");
        // We can't easily check taker balance relative to start without tracking spent amount, 
        // but checking maker and treasury covers the flow.
        
        // Also check sell token transfer
        // Taker starts with 0 Token Z (minted to maker, but taker has Token X) 
        // Wait, setup minted Token X to taker. Taker receives Token Z.
        // Taker balance of Z should increase.
        // For fuzzing, we assume previous state is clean or we track deltas. 
        // Since each fuzz run isolates state (in Foundry), we can assert absolute if we know start.
        // Taker starts with 0 Token Z? No, setup mints to Taker Token X. Maker Token Z.
        // So Taker.TokenZ is 0 initially.
        assertEq(tokenZ.balanceOf(taker), amountSellTransferred, "Taker should receive correct sell token amount");
    }

    function test_Fuzz_AdvertiseOrder(uint256 fee) public {
        uint256 minAdFee = swap.minAdFee();
        // Bound fee between minAdFee and 100 ether
        fee = bound(fee, minAdFee, 100 ether);

        // Give maker enough ETH
        vm.deal(maker, fee);

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

        vm.prank(maker);
        vm.expectEmit(false, true, false, true); 
        emit RajaSwap.OrderAdvertised(bytes32(0), maker, order.tokenSell, order.amountSell, order.tokenBuy, order.amountBuy, fee);

        swap.advertiseOrder{value: fee}(order);

        assertEq(address(swap).balance, fee, "Contract should hold the ad fee");
    }
}
