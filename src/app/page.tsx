import { IndexCards } from "@/components/dashboard/index-cards";
import { MarketOverviewPanel } from "@/components/dashboard/market-overview-panel";
import { BreadthCard } from "@/components/dashboard/breadth-card";
import { MarketStatsCard } from "@/components/dashboard/market-stats-card";
import { SectorPerformanceCard } from "@/components/dashboard/sector-performance-card";
import { IndexTrendCard } from "@/components/dashboard/index-trend-card";
import { FiiDiiCard } from "@/components/dashboard/fii-dii-card";
import { GlobalMarketsCard } from "@/components/dashboard/global-markets-card";
import { HighlightsCard } from "@/components/dashboard/highlights-card";
import { EventsCard } from "@/components/dashboard/events-card";
import { SessionFooter } from "@/components/dashboard/session-footer";

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4 p-3 sm:p-4">
      <IndexCards />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <MarketOverviewPanel />
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <IndexTrendCard />
            <FiiDiiCard />
            <div className="md:col-span-2 2xl:col-span-1">
              <GlobalMarketsCard />
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <BreadthCard />
          <MarketStatsCard />
          <SectorPerformanceCard />
          <HighlightsCard />
          <EventsCard />
        </div>
      </div>
      <SessionFooter />
    </div>
  );
}
