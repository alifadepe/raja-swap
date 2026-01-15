export const RAJA_SWAP_ABI = [
  {
    "inputs": [
      {
        "components": [
          { "internalType": "address", "name": "maker", "type": "address" },
          { "internalType": "address", "name": "tokenSell", "type": "address" },
          { "internalType": "uint256", "name": "amountSell", "type": "uint256" },
          { "internalType": "address", "name": "tokenBuy", "type": "address" },
          { "internalType": "uint256", "name": "amountBuy", "type": "uint256" },
          { "internalType": "uint256", "name": "nonce", "type": "uint256" },
          { "internalType": "uint256", "name": "deadline", "type": "uint256" },
          { "internalType": "address", "name": "desiredTaker", "type": "address" }
        ],
        "internalType": "struct RajaSwap.Order",
        "name": "order",
        "type": "tuple"
      },
      { "internalType": "bytes", "name": "signature", "type": "bytes" },
      { "internalType": "uint256", "name": "amountToFill", "type": "uint256" }
    ],
    "name": "fillOrder",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
    "name": "isOrderFilled",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "nonce", "type": "uint256" }],
    "name": "cancelOrder",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "feeBps",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "", "type": "address" },
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "name": "_nonceCancelled",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "minAdFee",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          { "internalType": "address", "name": "maker", "type": "address" },
          { "internalType": "address", "name": "tokenSell", "type": "address" },
          { "internalType": "uint256", "name": "amountSell", "type": "uint256" },
          { "internalType": "address", "name": "tokenBuy", "type": "address" },
          { "internalType": "uint256", "name": "amountBuy", "type": "uint256" },
          { "internalType": "uint256", "name": "nonce", "type": "uint256" },
          { "internalType": "uint256", "name": "deadline", "type": "uint256" },
          { "internalType": "address", "name": "desiredTaker", "type": "address" }
        ],
        "internalType": "struct RajaSwap.Order",
        "name": "order",
        "type": "tuple"
      }
    ],
    "name": "advertiseOrder",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
    "name": "filledAmount",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const

export const MOCK_ERC20_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "mint",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const
