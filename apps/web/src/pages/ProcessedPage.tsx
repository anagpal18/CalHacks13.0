// Processed: the drill-down behind Overview's "View more".
// Analytics of what the agents booked and what a person approved, then every processed invoice in a table.

import { ArrowLeft, Clock, Gauge, Users, Workflow } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { HorizontalBars } from "@/components/charts/HorizontalBars";
import { LollipopChart } from "@/components/charts/LollipopChart";
import { Panel, StatFigure } from "@/components/charts/Panel";
import { Sparkline } from "@/components/charts/Sparkline";
import { StackedColumns } from "@/components/charts/StackedColumns";
import { TickStrip } from "@/components/charts/TickStrip";
import { getDailyProcessing, listProcessedInvoices } from "@/data/dataSource";
import type { ProcessedInvoice } from "@/data/types";
import { useAsyncData } from "@/hooks/useAsyncData";
import { formatClockTime, formatDollars, formatShortDate } from "@/lib/format";
import { primaryButton } from "@/lib/buttonStyles";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "booked" | "paid";
const TABLE_PAGE_SIZE = 12;

export function ProcessedPage() {
  const daily = useAsyncData(getDailyProcessing, []) ?? [];
  const invoices = useAsyncData(listProcessedInvoices, []) ?? [];

  const processedCount = daily.reduce((sum, day) => sum + day.booked + day.held + day.asking, 0);
  const bookedCount = daily.reduce((sum, day) => sum + day.booked, 0);
  const heldCount = daily.reduce((sum, day) => sum + day.held, 0);
  const askingCount = daily.reduce((sum, day) => sum + day.asking, 0);
  const paidInvoices = invoices.filter((invoice) => invoice.status === "paid");
  const paidCents = paidInvoices.reduce((sum, invoice) => sum + invoice.amountCents, 0);
  const averageSeconds = daily.length ? daily.reduce((sum, day) => sum + day.averageSecondsToBook, 0) / daily.length : 0;

  return (
    <div className="space-y-5">
      <Link to="/overview" className={primaryButton("sm")}>
        <ArrowLeft className="size-4" /> Back to overview
      </Link>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Invoices processed" value={processedCount.toLocaleString()} note="Oct 18 – 24" trend={daily.map((day) => day.booked + day.held + day.asking)} />
        <Tile label="Booked without a person" value={processedCount ? `${Math.round((bookedCount / processedCount) * 100)}%` : "–"} note={`${bookedCount} of ${processedCount}`} trend={daily.map((day) => day.booked / Math.max(day.booked + day.held + day.asking, 1))} />
        <Tile label="Approved & paid" value={formatDollars(paidCents, { compact: true })} note={`${paidInvoices.length} invoices · signed by Dana Whitfield`} />
        <Tile label="Average time to book" value={`${averageSeconds.toFixed(1)}s`} note="From arrival to all 8 stamps" trend={daily.map((day) => day.averageSecondsToBook)} />
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-7" icon={Gauge} title="Processed per day" subtitle="Every invoice ends booked, held, or with a person">
          <StackedColumns
            series={[
              { key: "booked", label: "Booked", className: "bg-foreground" },
              { key: "asking", label: "Asked a person", className: "bg-asking" },
              { key: "held", label: "Held", className: "bg-held" },
            ]}
            columns={daily.map((day) => ({ key: day.date, label: day.dayLetter, values: { booked: day.booked, asking: day.asking, held: day.held } }))}
            height={240}
          />
        </Panel>

        <Panel className="xl:col-span-5" icon={Workflow} title="How invoices got through" subtitle="One tick per 4 invoices">
          <div className="space-y-8">
            <TickStrip
              unitsPerTick={4}
              groups={[
                { key: "auto", label: "Booked by agents", value: bookedCount, tone: "ink" },
                { key: "person", label: "Needed a person", value: askingCount, tone: "asking" },
              ]}
            />
            <TickStrip
              unitsPerTick={1}
              tickHeight={32}
              groups={[
                { key: "held", label: "Held, never booked", value: heldCount, tone: "held" },
                { key: "paid", label: "Paid after approval", value: paidInvoices.length, tone: "muted" },
              ]}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-5" icon={Users} title="Top vendors by amount" subtitle="Booked or paid this week">
          <HorizontalBars labelWidth={150} data={topVendors(invoices)} formatValue={(cents) => formatDollars(cents, { compact: true })} />
        </Panel>
        <Panel className="xl:col-span-7" icon={Clock} title="Time to book" subtitle="Average seconds from arrival to booked, per day">
          {daily.length > 0 && (
            <LollipopChart
              data={daily.map((day) => ({ key: day.date, label: day.dayLetter, value: day.averageSecondsToBook }))}
              formatValue={(seconds) => `${seconds.toFixed(1)}s`}
              height={230}
            />
          )}
        </Panel>
      </div>

      <ProcessedTable invoices={invoices} />
    </div>
  );
}

function Tile({ label, value, note, trend }: { label: string; value: string; note?: string; trend?: number[] }) {
  return (
    <div className="flex items-end justify-between gap-4 rounded-3xl bg-card p-5 shadow-[0_1px_2px_rgb(31_36_51/0.04),0_8px_24px_-12px_rgb(31_36_51/0.12)]">
      <StatFigure label={label} value={value} note={note} />
      {trend && trend.length > 1 && <Sparkline values={trend} width={96} height={36} />}
    </div>
  );
}

function topVendors(invoices: ProcessedInvoice[]) {
  const totals = new Map<string, number>();
  invoices.forEach((invoice) => totals.set(invoice.vendorName, (totals.get(invoice.vendorName) ?? 0) + invoice.amountCents));
  return [...totals.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, 6)
    .map(([vendorName, cents]) => ({ key: vendorName, label: vendorName, value: cents, tooltip: `${vendorName}: ${formatDollars(cents)}` }));
}

function ProcessedTable({ invoices }: { invoices: ProcessedInvoice[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isShowingAll, setShowingAll] = useState(false);
  const filtered = invoices.filter((invoice) => statusFilter === "all" || invoice.status === statusFilter);
  const visible = isShowingAll ? filtered : filtered.slice(0, TABLE_PAGE_SIZE);

  return (
    <Panel
      title="All processed invoices"
      subtitle="Each one passed all 8 stamps. Paid invoices were also approved by a person and matched to the bank record."
      action={
        <div className="flex rounded-full border border-border p-0.5 text-xs font-medium">
          {(["all", "booked", "paid"] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={cn("rounded-full px-3 py-1 capitalize transition", statusFilter === filter ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              {filter}
            </button>
          ))}
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Invoice</th>
              <th className="pb-2 font-medium">Vendor</th>
              <th className="pb-2 font-medium">Job site</th>
              <th className="pb-2 text-right font-medium">Amount</th>
              <th className="pb-2 pl-6 font-medium">Checks</th>
              <th className="pb-2 font-medium">Approved by</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Bank record</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((invoice) => (
              <tr key={invoice.billId} className="hover:bg-background/60">
                <td className="py-2.5 font-mono text-xs">{invoice.invoiceNumber}</td>
                <td className="py-2.5 font-medium">{invoice.vendorName}</td>
                <td className="py-2.5 text-muted-foreground">{invoice.jobSite}</td>
                <td className="py-2.5 text-right font-semibold tabular-nums">{formatDollars(invoice.amountCents)}</td>
                <td className="py-2.5 pl-6 text-muted-foreground">8/8 · {invoice.secondsToBook}s</td>
                <td className="py-2.5">{invoice.approvedBy}</td>
                <td className="py-2.5">
                  <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", invoice.status === "paid" ? "text-approved" : "text-foreground")}>
                    <span className={cn("size-1.5 rounded-full", invoice.status === "paid" ? "bg-approved" : "bg-foreground")} />
                    {invoice.status === "paid" ? `Paid ${formatShortDate(invoice.paidOn!)}` : `Booked ${formatClockTime(invoice.processedAt)}`}
                  </span>
                </td>
                <td className="py-2.5 font-mono text-xs text-muted-foreground">{invoice.nessieTransferId ? `${invoice.nessieTransferId} · matched` : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > TABLE_PAGE_SIZE && (
        <button onClick={() => setShowingAll((showing) => !showing)} className={primaryButton("md", "mt-4 w-full")}>
          {isShowingAll ? "Show fewer" : `Show all ${filtered.length}`}
        </button>
      )}
    </Panel>
  );
}
