"use client";

import { useEffect, useState } from "react";

/** L'invitation que le navigateur remet quand il accepte d'installer l'application. */
type InvitationInstallation = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Bouton d'installation, discret.
 *
 * Il ne s'affiche que si le navigateur propose l'installation : ni dans une
 * fenêtre déjà installée, ni dans un navigateur qui ne la connaît pas — une
 * page ne peut pas la déclencher d'elle-même. Ailleurs, l'installation se
 * fait par le menu du navigateur.
 */
export function BoutonInstallation() {
  const [invitation, setInvitation] = useState<InvitationInstallation | null>(null);

  useEffect(() => {
    const retenir = (evenement: Event) => {
      evenement.preventDefault();
      setInvitation(evenement as InvitationInstallation);
    };
    const oublier = () => setInvitation(null);

    window.addEventListener("beforeinstallprompt", retenir);
    window.addEventListener("appinstalled", oublier);
    return () => {
      window.removeEventListener("beforeinstallprompt", retenir);
      window.removeEventListener("appinstalled", oublier);
    };
  }, []);

  if (!invitation) return null;

  const installer = async () => {
    await invitation.prompt();
    await invitation.userChoice;
    // Une invitation ne sert qu'une fois, acceptée ou non.
    setInvitation(null);
  };

  return (
    <button
      type="button"
      onClick={installer}
      className="border-app-line text-secondary hover:bg-surface-hover hover:text-light w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors"
    >
      Installer l&apos;application
    </button>
  );
}
