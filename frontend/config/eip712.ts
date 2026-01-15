import { RAJA_SWAP_CONTRACT_ADDRESS } from '@/config/contracts'

export const DOMAIN = {
  name: 'RajaSwap',
  version: '1',
  chainId: 5003, // Mantle Sepolia
  verifyingContract: RAJA_SWAP_CONTRACT_ADDRESS as `0x${string}`
} as const

export const TYPES = {
  Order: [
    { name: 'maker', type: 'address' },
    { name: 'tokenSell', type: 'address' },
    { name: 'amountSell', type: 'uint256' },
    { name: 'tokenBuy', type: 'address' },
    { name: 'amountBuy', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'desiredTaker', type: 'address' }
  ]
} as const
