"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  decider,
  DELAI_ENTRE_VERIFICATIONS_MS,
  INTERVALLE_ATTENTE_MS,
  INTERVALLE_VERSION_MS,
  lireVersion,
  peutRafraichir,
} from "@/lib/actualisation";

/** Mémoire de l'onglet : la version pour laquelle on a déjà rechargé une fois. */
const CLE_RECHARGEMENT = "ffa:version-rechargee";

function dejaRechargeePour(): string | null {
  try {
    return window.sessionStorage.getItem(CLE_RECHARGEMENT);
  } catch {
    return null;
  }
}

function retenirRechargement(version: string) {
  try {
    window.sessionStorage.setItem(CLE_RECHARGEMENT, version);
  } catch {
    // Stockage refusé : on recharge quand même, la boucle reste bornée par le serveur.
  }
}

function suivreReseau(prevenir: () => void) {
  window.addEventListener("online", prevenir);
  window.addEventListener("offline", prevenir);
  return () => {
    window.removeEventListener("online", prevenir);
    window.removeEventListener("offline", prevenir);
  };
}

type Annonce = "aucune" | "attente" | "proposee";

/**
 * Tient l'application ouverte à jour, sans réinstallation.
 *
 * Elle lit la version en service au lancement, au retour au premier plan, au
 * retour du réseau et à intervalle régulier ; elle relit les données de la
 * page aux mêmes moments. Elle ne recharge jamais pendant une saisie ni juste
 * après un geste : la version attend, et l'utilisateur garde la main.
 */
export function Actualisation({ version }: { version: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const enLigne = useSyncExternalStore(
    suivreReseau,
    () => navigator.onLine,
    () => true,
  );
  const [annonce, setAnnonce] = useState<Annonce>("aucune");
  const memoire = useRef({
    lue: null as string | null,
    saisie: false,
    dernierGeste: 0,
    derniereVerification: 0,
    dernierRafraichissement: 0,
  });

  useEffect(() => {
    const etat = memoire.current;
    // Arrivée sur une page : rien n'y a encore été saisi, c'est un moment sûr.
    etat.saisie = false;
    let actif = true;

    const examiner = (momentSur: boolean) => {
      const decision = decider({
        chargee: version,
        lue: etat.lue,
        saisie: etat.saisie,
        dernierGeste: momentSur ? 0 : etat.dernierGeste,
        maintenant: Date.now(),
        dejaRechargeePour: dejaRechargeePour(),
        enLigne: navigator.onLine,
      });

      if (decision === "recharger" && etat.lue) {
        retenirRechargement(etat.lue);
        window.location.reload();
        return;
      }
      setAnnonce(
        decision === "attendre" ? "attente" : decision === "proposer" ? "proposee" : "aucune",
      );
    };

    const verifier = async (momentSur: boolean) => {
      if (!navigator.onLine) return;
      etat.derniereVerification = Date.now();
      try {
        const reponse = await fetch("/api/version", { cache: "no-store" });
        if (!reponse.ok) return;
        etat.lue = lireVersion(await reponse.json()) ?? etat.lue;
      } catch {
        // Réseau coupé en route : la prochaine lecture reprendra.
        return;
      }
      if (actif) examiner(momentSur);
    };

    const rafraichir = () => {
      const maintenant = Date.now();
      if (
        !peutRafraichir({
          saisie: etat.saisie,
          enLigne: navigator.onLine,
          dernierRafraichissement: etat.dernierRafraichissement,
          maintenant,
        })
      ) {
        return;
      }
      etat.dernierRafraichissement = maintenant;
      router.refresh();
    };

    const auRetour = () => {
      if (document.visibilityState !== "visible") return;
      void verifier(false);
      rafraichir();
    };
    const auReseau = () => {
      void verifier(false);
      rafraichir();
    };
    const aLaSaisie = () => {
      etat.saisie = true;
      etat.dernierGeste = Date.now();
    };
    const auGeste = () => {
      etat.dernierGeste = Date.now();
    };

    document.addEventListener("visibilitychange", auRetour);
    window.addEventListener("online", auReseau);
    document.addEventListener("input", aLaSaisie, true);
    document.addEventListener("change", aLaSaisie, true);
    document.addEventListener("pointerdown", auGeste, true);
    document.addEventListener("keydown", auGeste, true);

    const lecture = window.setInterval(() => void verifier(false), INTERVALLE_VERSION_MS);
    const attente = window.setInterval(() => {
      if (etat.lue && etat.lue !== version) examiner(false);
    }, INTERVALLE_ATTENTE_MS);

    if (Date.now() - etat.derniereVerification >= DELAI_ENTRE_VERIFICATIONS_MS) {
      void verifier(true);
    } else {
      examiner(true);
    }

    return () => {
      actif = false;
      document.removeEventListener("visibilitychange", auRetour);
      window.removeEventListener("online", auReseau);
      document.removeEventListener("input", aLaSaisie, true);
      document.removeEventListener("change", aLaSaisie, true);
      document.removeEventListener("pointerdown", auGeste, true);
      document.removeEventListener("keydown", auGeste, true);
      window.clearInterval(lecture);
      window.clearInterval(attente);
    };
  }, [pathname, router, version]);

  if (enLigne && annonce === "aucune") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-navy-soft border-navy-line text-light fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg"
    >
      {!enLigne ? (
        <p>
          Hors connexion : ce qui est affiché peut ne plus être à jour, et rien ne peut être
          enregistré pour l&apos;instant.
        </p>
      ) : (
        <>
          <p>
            Une nouvelle version est disponible.
            {annonce === "attente" ? " Elle se chargera quand vous aurez terminé." : null}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-gold hover:text-gold-bright focus-visible:outline-gold rounded underline underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Actualiser maintenant
          </button>
        </>
      )}
    </div>
  );
}
