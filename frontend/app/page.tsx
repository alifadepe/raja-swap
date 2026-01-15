import Link from "next/link";
import { ArrowRight, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { Navbar } from "@/components/Navbar";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 selection:bg-blue-500/20">
      <Navbar />

      <main className="container mx-auto px-4 py-20">
        <div className="text-center max-w-3xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 bg-blue-950/30 border border-blue-900/50 px-3 py-1 rounded-full text-blue-400 text-sm font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Active on Mantle Sepolia
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
            Trustless OTC Swaps <br />
            <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Made Simple
            </span>
          </h1>

          <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Trade any ERC-20 token directly with peers. No slippage, no liquidity pools, just secure atomic swaps.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href="/create"
              className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
            >
              Create Order <ArrowRight size={18} />
            </Link>
            <Link
              href="/market"
              className="w-full sm:w-auto px-8 py-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
            >
              Browse Market
            </Link>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mt-32">
          <FeatureCard
            icon={<ShieldCheck className="text-blue-400" size={32} />}
            title="Trustless & Secure"
            description="Trades are settled atomically on-chain. Funds never leave your wallet until the trade is executed."
          />
          <FeatureCard
            icon={<Zap className="text-indigo-400" size={32} />}
            title="Gasless Listings"
            description="Makers sign orders off-chain via EIP-712. Zero gas fees to create listings."
          />
          <FeatureCard
            icon={<RefreshCw className="text-purple-400" size={32} />}
            title="Any Token Pair"
            description="Swap any ERC-20 token. Perfect for private deals, vesting tokens, or illiquid assets."
          />
        </div>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800/50 hover:border-slate-700 hover:bg-slate-900/80 transition-all group">
      <div className="mb-4 bg-slate-950 w-12 h-12 rounded-lg flex items-center justify-center border border-slate-800 group-hover:border-slate-700 transition-colors">
        {icon}
      </div>
      <h3 className="text-xl font-semibold mb-2 text-slate-200">{title}</h3>
      <p className="text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}
