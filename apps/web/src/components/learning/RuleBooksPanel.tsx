// What the agents learned: each seat agent's rule book, built from the AP manager's decisions on the Check page.
// One column per agent; each learned rule shows its stamp, scope, the bill it came from and how often it's been used.

import { AnimatePresence, motion } from "motion/react";
import { BookOpen, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { listRuleBooks, removeRule } from "@/data/dataSource";
import { STAMP_CATALOG } from "@/data/stampCatalog";
import type { LearnedRule } from "@/data/types";
import { useAsyncData } from "@/hooks/useAsyncData";
import { cn } from "@/lib/utils";

const DECISION_LABEL = { approve: "Approved", reject: "Rejected", escalate: "Escalated" } as const;

export function RuleBooksPanel() {
  const [reloadKey, setReloadKey] = useState(0);
  const ruleBooks = useAsyncData(listRuleBooks, [reloadKey]);
  const totalRules = ruleBooks?.reduce((sum, book) => sum + book.learned.length, 0) ?? 0;
  const { hash } = useLocation();
  // "See the rule books" from the Check page lands here.
  useEffect(() => {
    if (hash === "#rule-books" && ruleBooks) document.getElementById("rule-books")?.scrollIntoView({ behavior: "smooth" });
  }, [hash, ruleBooks]);

  async function handleRemove(rule: LearnedRule) {
    await removeRule(rule.seat, rule.id);
    setReloadKey((key) => key + 1);
  }

  return (
    <section id="rule-books" className="scroll-mt-24 rounded-3xl bg-card p-8 shadow-[0_1px_2px_rgb(31_36_51/0.04),0_8px_24px_-12px_rgb(31_36_51/0.12)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><BookOpen className="size-4" /> Rule books</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">What the agents learned</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every decision made on the Check page becomes a rule for the agent that owns the stamp. Agents read their rule book before checking each bill.
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tabular-nums">{totalRules}</div>
          <div className="text-xs text-muted-foreground">rules learned</div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {(ruleBooks ?? []).map((book) => (
          <div key={book.seat} className="flex flex-col rounded-2xl border border-border bg-background/50 p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold">{book.title}</h3>
              <span className="text-xs text-muted-foreground">
                signs {STAMP_CATALOG.filter((definition) => definition.signedBy === book.seat).map((definition) => definition.label.toLowerCase()).join(", ")}
              </span>
            </div>
            <div className="mt-3 flex-1 space-y-2">
              <AnimatePresence initial={false}>
                {book.learned.length === 0 && (
                  <p className="rounded-xl border border-dashed border-foreground/10 p-4 text-center text-sm text-muted-foreground">
                    No rules yet. Decide on one of {book.title}'s stamps on the Check page.
                  </p>
                )}
                {book.learned.map((rule) => (
                  <motion.div key={rule.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="group rounded-xl border border-border bg-card p-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded-md bg-data-soft px-1.5 py-0.5 font-mono font-medium text-foreground">{rule.id}</span>
                      <span className="text-muted-foreground">{STAMP_CATALOG.find((definition) => definition.id === rule.stamp)?.label}</span>
                      <span className="truncate text-muted-foreground">· {rule.scope}</span>
                      <button onClick={() => handleRemove(rule)} aria-label={`Remove rule ${rule.id}`} className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-held focus-visible:opacity-100 group-hover:opacity-100">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <p className="mt-1.5 text-sm leading-snug">{rule.text}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>
                        {rule.decision ? `${DECISION_LABEL[rule.decision]} by the ${rule.byRole === "controller" ? "Controller" : "site PM"}` : "From a decision"} on{" "}
                        <Link to={`/check/${rule.sourceBillId}`} className="underline-offset-2 hover:text-foreground hover:underline">{rule.sourceBillId}</Link>
                      </span>
                      <span className={cn(rule.timesUsed > 0 && "font-medium text-foreground")}>Used {rule.timesUsed} {rule.timesUsed === 1 ? "time" : "times"}</span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
