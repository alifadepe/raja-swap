// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {EIP712} from "openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";

contract RajaSwap is EIP712, ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // Custom Errors
    error OrderExpired(uint256 deadline);
    error InvalidAmount();
    error UnauthorizedTaker(address expected, address actual);
    error OrderAlreadyFilled(bytes32 orderHash);
    error OrderCancelled(bytes32 orderHash);
    error InvalidSignature();
    error FeeTransferFailed();
    error InvalidFee(uint256 fee);
    error OrderOverfilled(uint256 remaining, uint256 requested);

    struct Order {
        address maker;
        address tokenSell;
        uint256 amountSell;
        address tokenBuy;
        uint256 amountBuy;
        uint256 nonce;
        uint256 deadline;
        address desiredTaker;
    }

    bytes32 private constant ORDER_TYPEHASH = keccak256(
        "Order(address maker,address tokenSell,uint256 amountSell,address tokenBuy,uint256 amountBuy,uint256 nonce,uint256 deadline,address desiredTaker)"
    );

    mapping(bytes32 => uint256) public filledAmount; // Tracks amountBuy filled for an order
    mapping(address => mapping(uint256 => bool)) public _nonceCancelled;

    uint256 public feeBps = 10; // 0.1% (10 bps) initially

    uint256 public minAdFee = 5 ether; // 5 MNT
    
    event MinAdFeeUpdated(uint256 oldFee, uint256 newFee);

    event OrderAdvertised(
        bytes32 indexed orderHash,
        address indexed maker,
        address tokenSell,
        uint256 amountSell,
        address tokenBuy,
        uint256 amountBuy,
        uint256 feePaid
    );

    event FeeBpsUpdated(uint256 oldFee, uint256 newFee);

    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed taker,
        address tokenSell,
        uint256 amountSell,
        address tokenBuy,
        uint256 amountBuy
    );

    event OrderCancelledEvent(address indexed maker, uint256 nonce);

    constructor() EIP712("RajaSwap", "1") Ownable(msg.sender) {}

    /**
     * @notice Atomic swap executing an EIP-712 signed order.
     * @param order The Order struct containing trade details.
     * @param signature The EIP-712 signature from the Maker.
     */
    function fillOrder(Order calldata order, bytes calldata signature, uint256 amountToFill)
        external
        nonReentrant
        whenNotPaused
    {
        // 1. Validations
        if (order.deadline != 0 && block.timestamp > order.deadline) revert OrderExpired(order.deadline);
        if (order.amountBuy == 0 || amountToFill == 0) revert InvalidAmount();

        // Private Order Check
        if (order.desiredTaker != address(0) && msg.sender != order.desiredTaker) {
            revert UnauthorizedTaker(order.desiredTaker, msg.sender);
        }

        // Verify Signature
        bytes32 structHash;
        {
            bytes32 typeHash = ORDER_TYPEHASH;
            address maker = order.maker;
            address tokenSell = order.tokenSell;
            uint256 amountSell = order.amountSell;
            address tokenBuy = order.tokenBuy;
            uint256 amountBuy = order.amountBuy;
            uint256 nonce = order.nonce;
            uint256 deadline = order.deadline;
            address desiredTaker = order.desiredTaker;

            assembly {
                let ptr := mload(0x40) // Load free memory pointer
                mstore(ptr, typeHash)
                mstore(add(ptr, 0x20), maker)
                mstore(add(ptr, 0x40), tokenSell)
                mstore(add(ptr, 0x60), amountSell)
                mstore(add(ptr, 0x80), tokenBuy)
                mstore(add(ptr, 0xa0), amountBuy)
                mstore(add(ptr, 0xc0), nonce)
                mstore(add(ptr, 0xe0), deadline)
                mstore(add(ptr, 0x100), desiredTaker)
                structHash := keccak256(ptr, 0x120) // 9 * 32 = 288 (0x120)
            }
        }

        bytes32 hash = _hashTypedDataV4(structHash);

        // Verify Status (Partial Fill Logic)
        if (filledAmount[hash] + amountToFill > order.amountBuy) {
            revert OrderOverfilled(order.amountBuy - filledAmount[hash], amountToFill);
        }
        if (_nonceCancelled[order.maker][order.nonce]) revert OrderCancelled(hash);

        address signer = ECDSA.recover(hash, signature);
        if (signer != order.maker) revert InvalidSignature();

        // 2. Update State
        filledAmount[hash] += amountToFill;

        // 3. Asset Transfer (Checks-Effects-Interactions)

        // Calculate proportional Sell Amount based on amountToFill (Token Buy)
        // amountSellToTransfer = (amountToFill * order.amountSell) / order.amountBuy
        uint256 amountSellToTransfer = (amountToFill * order.amountSell) / order.amountBuy;

        // Calculate Fee (0.1% of amountToFill)
        uint256 fee = (amountToFill * feeBps) / 10000;
        uint256 makerAmount = amountToFill - fee;

        if (fee > 0) {
            IERC20(order.tokenBuy).safeTransferFrom(msg.sender, address(this), fee);
        }
        IERC20(order.tokenBuy).safeTransferFrom(msg.sender, order.maker, makerAmount);

        // Transfer Asset Sell (Maker -> Taker)
        IERC20(order.tokenSell).safeTransferFrom(order.maker, msg.sender, amountSellToTransfer);

        emit OrderFilled(
            hash, order.maker, msg.sender, order.tokenSell, amountSellToTransfer, order.tokenBuy, amountToFill
        );
    }

    /**
     * @notice Advertise an order by paying a fee in native token (MNT).
     * @dev Users can pay more than minAdFee to prioritize their order.
     * @param order The order to advertise.
     */
    function advertiseOrder(Order calldata order) external payable {
        if (msg.value < minAdFee) revert InvalidFee(msg.value);

        bytes32 structHash;
        {
            bytes32 typeHash = ORDER_TYPEHASH;
            address maker = order.maker;
            address tokenSell = order.tokenSell;
            uint256 amountSell = order.amountSell;
            address tokenBuy = order.tokenBuy;
            uint256 amountBuy = order.amountBuy;
            uint256 nonce = order.nonce;
            uint256 deadline = order.deadline;
            address desiredTaker = order.desiredTaker;

            assembly {
                let ptr := mload(0x40) // Load free memory pointer
                mstore(ptr, typeHash)
                mstore(add(ptr, 0x20), maker)
                mstore(add(ptr, 0x40), tokenSell)
                mstore(add(ptr, 0x60), amountSell)
                mstore(add(ptr, 0x80), tokenBuy)
                mstore(add(ptr, 0xa0), amountBuy)
                mstore(add(ptr, 0xc0), nonce)
                mstore(add(ptr, 0xe0), deadline)
                mstore(add(ptr, 0x100), desiredTaker)
                structHash := keccak256(ptr, 0x120) // 9 * 32 = 288 (0x120)
            }
        }

        bytes32 hash = _hashTypedDataV4(structHash);

        emit OrderAdvertised(
            hash,
            order.maker,
            order.tokenSell,
            order.amountSell,
            order.tokenBuy,
            order.amountBuy,
            msg.value
        );
    }

    /**
     * @notice Set the minimum advertising fee.
     * @param newMinAdFee new fee in wei.
     */
    function setMinAdFee(uint256 newMinAdFee) external onlyOwner {
        uint256 oldFee = minAdFee;
        minAdFee = newMinAdFee;
        emit MinAdFeeUpdated(oldFee, newMinAdFee);
    }

    /**
     * @notice Withdraw accumulated native fees (MNT) to owner.
     * @dev Anyone can call this to push funds to the owner.
     * @param amount Amount to withdraw.
     */
    function withdrawAdsFee(uint256 amount) external {
        (bool success, ) = owner().call{value: amount}("");
        require(success, "Withdraw failed");
    }

    /**
     * @notice Invalidate a nonce on-chain so the off-chain signature becomes invalid.
     */
    function cancelOrder(uint256 nonce) external {
        _nonceCancelled[msg.sender][nonce] = true;
        emit OrderCancelledEvent(msg.sender, nonce);
    }

    /**
     * @notice Withdraw accumulated fees.
     */
    function withdrawFees(address token, uint256 amount) external {
        IERC20(token).safeTransfer(owner(), amount);
    }

    /**
     * @notice Update the protocol fee.
     * @param newFeeBps New fee in basis points (max 10% = 1000 bps).
     */
    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > 1000) revert InvalidFee(newFeeBps);
        uint256 oldFee = feeBps;
        feeBps = newFeeBps;
        emit FeeBpsUpdated(oldFee, newFeeBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
