// "Try to scam us": a judge picks an attacker card and lands on Verify with that persona.

import { motion } from "motion/react";
import { Skull, UserX, Ghost, AlertTriangle, ShieldQuestion, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const navigate = useNavigate();

  const launchAttack = (personaId: string) => {
    onOpenChange(false);
    navigate(`/verify/${personaId}?attack=${Date.now()}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-held/30 bg-card backdrop-blur sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Try to scam us</DialogTitle>
          <DialogDescription>Pick an attack. We'll run it through the identity checks and show you what happens.</DialogDescription>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}
