# RajaSwap

**RajaSwap** is a decentralized, trustless Over-The-Counter (OTC) swap protocol built on the **Mantle Sepolia** Layer 2 network.

It enables users to trade any ERC-20 token directly with another party without slippage, using an off-chain order book (Supabase) for gas-less order creation and on-chain settlement for complete security.

## 🌟 Features

-   **Trustless OTC Swaps**: Securely swap ERC-20 tokens with 0 slippage.
-   **Gas-less Listings**: Creating an order is free (off-chain **EIP-712** signature). Gas is only paid when filling an order.
-   **Partial Fills**: Orders can be partially filled, allowing flexible trading.
-   **Private & Public Orders**: Create orders for a specific wallet or open to the public.
-   **Order Advertising**: Promote your order by paying a fee in MNT for increased visibility.
-   **Xellar Wallet Integration**: Seamless onboarding with Xellar's embedded wallet and social login.
-   **Fee Structure**: A configurable protocol fee (default 0.1% or 10 BPS) is charged to the **Maker** upon success.
-   **Non-Custodial Listings**: Assets remain in your wallet until the swap is executed. No depositing into a contract required.
-   **Shareable Order Links**: Every order has a unique URL, perfect for sharing via DM or social media for direct deals.
-   **Verified Token Badges**: Visual indicators for trusted tokens to ensure safety against impostor assets.
-   **Real-time Sync**: Order status is synced from blockchain to database automatically.

## 🏗 Tech Stack

-   **Blockchain**: Mantle Sepolia Testnet
-   **Smart Contract**: Solidity
-   **Frontend**: Next.js, Tailwind CSS, Wagmi, Viem
-   **Wallet**: Xellar Kit
-   **Backend**: Supabase (Edge Functions, PostgreSQL)

## 📁 Project Structure

```
├── contract/           # Solidity smart contracts (Foundry)
│   ├── src/            # Contract source files
│   ├── test/           # Contract tests
│   └── script/         # Deployment scripts
├── frontend/           # Next.js frontend application
│   ├── app/            # Next.js app router pages
│   ├── components/     # React components
│   ├── config/         # Configuration files
│   └── lib/            # Utility functions
└── backend/            # Supabase Edge Functions
    └── supabase/
        └── functions/  # Edge functions (add-order, advertise-order, sync-order)
```

## 🛡 Security

-   **EIP-712 Signatures**: Orders are cryptographically signed by the Maker.
-   **Nonce Management**: Prevents replay attacks.
-   **Deadline Enforcement**: Orders automatically expire.
-   **On-chain Verification**: All transactions are verified on the blockchain before database updates.

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Foundry (for smart contracts)
- Supabase CLI (for backend)

### Smart Contracts
```bash
cd contract
forge install
forge build
forge test
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend (Supabase Functions)
```bash
cd backend
npx supabase functions deploy
```

## 🤝 Contributing

1.  Fork the repo
2.  Create your feature branch (`git checkout -b feature/amazing-feature`)
3.  Commit your changes (`git commit -m 'Add some amazing feature'`)
4.  Push to the branch (`git push origin feature/amazing-feature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
