// "Try to scam us": a judge picks an attacker card and watches the identity check run on it, right in the dialog.

import { motion } from "motion/react";
import { ArrowLeft, Skull, UserX, Ghost, AlertTriangle, ShieldQuestion, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { IdentityCheck } from "@/components/check/IdentityCheck";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { primaryButton } from "@/lib/buttonStyles";
import { formatDollars } from "@/lib/format";
import { MOCK_CRS_RESULTS } from "@/data/mockData";

interface ScamCard {
  personaId: string;
  title: string;
  pitch: string;
  icon: LucideIcon;
}

const SCAM_CARDS: ScamCard[] = [
  { personaId: "P13", title: "Swap the bank account", pitch: "Pose as Okafor Electric billing and send new bank details", icon: Skull },
  { personaId: "P12", title: "Impersonate a contact", pitch: "Claim to be Summit Steel's accounts manager", icon: UserX },
  { personaId: "P14", title: "Invent a ghost vendor", pitch: "Open a new vendor using a dead person's identity", icon: Ghost },
  { personaId: "P16", title: "Push past a fraud alert", pitch: "Set up a vendor whose owner has a fraud alert", icon: ShieldQuestion },
  { personaId: "P08", title: "Hide money trouble", pitch: "A real vendor with a tax lien and a judgment", icon: AlertTriangle },
];

export function ScamConsoleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [attackPersonaId, setAttackPersonaId] = useState<string | null>(null);
  const launchAttack = (personaId: string) => setAttackPersonaId(personaId);
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setAttackPersonaId(null);
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={attackPersonaId ? "max-h-[90vh] max-w-5xl overflow-y-auto border-held/30 bg-card sm:max-w-5xl" : "max-w-2xl border-held/30 bg-card backdrop-blur sm:max-w-2xl"}>
        <DialogHeader>
          <DialogTitle className="text-2xl">Try to scam us</DialogTitle>
          <DialogDescription>Pick an attack. We'll run it through the identity checks and show you what happens.</DialogDescription>
        </DialogHeader>
        {attackPersonaId ? (
          <div className="space-y-4">
            <button onClick={() => setAttackPersonaId(null)} className={primaryButton("sm")}><ArrowLeft className="size-3.5" /> Pick another attack</button>
            <IdentityCheck personaId={attackPersonaId} reason={SCAM_CARDS.find((card) => card.personaId === attackPersonaId)?.pitch} />
          </div>
        ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {SCAM_CARDS.map((card, index) => {
            const persona = MOCK_CRS_RESULTS.find((result) => result.personaId === card.personaId)!;
            const Icon = card.icon;
            return (
              <motion.button
                key={card.personaId}
                onClick={() => launchAttack(card.personaId)}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ y: -3 }}
                className="group flex gap-3 rounded-xl border border-foreground/8 bg-background/60 p-4 text-left transition-colors hover:border-held/50 hover:bg-held/8"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-held/12 text-held group-hover:bg-held group-hover:text-white">
                  <Icon className="size-5" />
                </span>
                <span className="space-y-1">
                  <span className="block font-semibold">{card.title}</span>
                  <span className="block text-sm text-muted-foreground">{card.pitch}</span>
                  <span className="block font-mono text-xs text-muted-foreground/80">
                    {persona.personaId} {persona.personaName} · {formatDollars(persona.amountAtStakeCents)} at stake
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
