// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {RajaSwap} from "../src/RajaSwap.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract RajaSwapAdsTest is Test {
    RajaSwap public swap;
    MockERC20 public tokenZ;
    MockERC20 public tokenX;

    uint256 internal makerPrivateKey;
    address internal maker;
    address internal taker;

    // Default fee is 5 MNT (5 ether)
    uint256 constant MIN_AD_FEE = 5 ether;

    function setUp() public {
        swap = new RajaSwap();
        tokenZ = new MockERC20("Token Z", "TKZ");
        tokenX = new MockERC20("Token X", "TKX");

        makerPrivateKey = 0xA11CE;
        maker = vm.addr(makerPrivateKey);
        taker = address(0xB0B);

        // Fund maker for fees
        vm.deal(maker, 100 ether);
    }

    function _getDummyOrder() internal view returns (RajaSwap.Order memory) {
         return RajaSwap.Order({
            maker: maker,
            tokenSell: address(tokenZ),
            amountSell: 100 ether,
            tokenBuy: address(tokenX),
            amountBuy: 500 ether,
            nonce: 1,
            deadline: block.timestamp + 1 hours,
            desiredTaker: address(0)
        });
    }

    function test_AdvertiseOrder_Success_MinFee() public {
        RajaSwap.Order memory order = _getDummyOrder();

        vm.prank(maker);
        // Expect event with feePaid = MIN_AD_FEE
        vm.expectEmit(false, true, false, true); 
        emit RajaSwap.OrderAdvertised(bytes32(0), maker, order.tokenSell, order.amountSell, order.tokenBuy, order.amountBuy, MIN_AD_FEE);

        swap.advertiseOrder{value: MIN_AD_FEE}(order);

        // Check fee remained in contract
        assertEq(address(swap).balance, MIN_AD_FEE);
    }

    function test_AdvertiseOrder_Success_HigherFee() public {
        RajaSwap.Order memory order = _getDummyOrder();
        uint256 paidAmount = 10 ether; // Paying double the min fee

        vm.prank(maker);
        // Expect event with feePaid = paidAmount
        vm.expectEmit(false, true, false, true); 
        emit RajaSwap.OrderAdvertised(bytes32(0), maker, order.tokenSell, order.amountSell, order.tokenBuy, order.amountBuy, paidAmount);

        swap.advertiseOrder{value: paidAmount}(order);

        // Check fee remained in contract (no refund)
        assertEq(address(swap).balance, paidAmount);
    }

    function test_AdvertiseOrder_InsufficientFee() public {
        RajaSwap.Order memory order = _getDummyOrder();

        vm.prank(maker);
        vm.expectRevert(abi.encodeWithSelector(RajaSwap.InvalidFee.selector, MIN_AD_FEE - 1));
        swap.advertiseOrder{value: MIN_AD_FEE - 1}(order);
    }

    function test_SetMinAdFee_Owner() public {
        uint256 newFee = 10 ether;

        vm.expectEmit(true, true, true, true);
        emit RajaSwap.MinAdFeeUpdated(MIN_AD_FEE, newFee);

        swap.setMinAdFee(newFee);
        assertEq(swap.minAdFee(), newFee);
    }

    function test_SetMinAdFee_Revert_Unauthorized() public {
        vm.prank(taker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, taker));
        swap.setMinAdFee(10 ether);
    }

    function test_WithdrawAdsFee_Owner() public {
        // Generate some fees
        RajaSwap.Order memory order = _getDummyOrder();
        vm.prank(maker);
        swap.advertiseOrder{value: MIN_AD_FEE}(order);
        vm.prank(maker);
        swap.advertiseOrder{value: MIN_AD_FEE}(order); // total 10 ether

        assertEq(address(swap).balance, 10 ether);

        uint256 ownerInitial = address(this).balance; // Test contract is owner
        
        // Withdraw 3 ether
        swap.withdrawAdsFee(3 ether);
        assertEq(address(swap).balance, 7 ether);
        assertEq(address(this).balance, ownerInitial + 3 ether);
    }

    function test_WithdrawAdsFee_Public() public {
        // Generate fee
        RajaSwap.Order memory order = _getDummyOrder();
        vm.prank(maker);
        swap.advertiseOrder{value: MIN_AD_FEE}(order);

        uint256 ownerInitial = address(this).balance;

        // Taker (non-owner) calls withdraw
        vm.prank(taker);
        swap.withdrawAdsFee(MIN_AD_FEE);

        // Funds should still go to owner
        assertEq(address(this).balance, ownerInitial + MIN_AD_FEE);
        assertEq(address(swap).balance, 0);
    }
    
    // Allow test contract to receive ETH
    receive() external payable {}
}
