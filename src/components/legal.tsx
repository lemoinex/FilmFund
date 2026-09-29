import type { ReactNode } from "react";

import { Footer } from "@/components/landing/footer";
import { Navbar } from "@/components/landing/navbar";

/*
 * Briques de mise en page pour les pages legales. Ecrites a la main plutot
 * qu'avec un plugin typographique : quelques composants suffisent et evitent
 * une dependance de plus.
 */

/**
 * Coque commune aux pages legales : meme en-tete sombre, meme colonne de
 * lecture ivoire, meme avertissement de relecture. Les deux pages partagent
 * ainsi une seule mise en page.
 */
export function LegalPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <a
        href="#contenu"
        className="bg-gold text-navy sr-only rounded-full px-5 py-2.5 text-sm font-medium focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-60"
      >
        Aller au contenu principal
      </a>
      <Navbar />

      <main id="contenu" className="flex-1">
        <header className="bg-navy border-navy-line/60 border-b">
          <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
            <p className="eyebrow text-gold mb-5">Informations légales</p>
            <h1 className="font-serif text-4xl leading-tight tracking-tight text-balance sm:text-5xl">
              {title}
            </h1>
            <p className="text-light-muted mt-5 text-sm">Dernière mise à jour : {updatedAt}</p>
          </div>
        </header>

        <div className="bg-ivory text-ink">
          <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
            {/*
             * Avertissement de relecture : ces documents comportent encore des
             * champs a renseigner. Il disparaitra une fois ceux-ci remplis.
             */}
            <aside
              role="note"
              className="border-gold-deep/30 bg-gold/10 mb-14 rounded-xl border p-5"
            >
              <p className="text-ink text-sm leading-relaxed text-pretty">
                <strong className="font-medium">Document en cours de finalisation.</strong> Les
                champs surlignés doivent être renseignés avant toute mise en production. Ce texte
                est un modèle de travail et ne constitue pas un conseil juridique.
              </p>
            </aside>

            <div className="space-y-10">{children}</div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="border-ink/10 scroll-mt-24 border-t pt-10 first:border-t-0 first:pt-0"
    >
      <h2 className="font-serif text-2xl leading-tight tracking-tight text-balance sm:text-3xl">
        {title}
      </h2>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

export function LegalParagraph({ children }: { children: ReactNode }) {
  return <p className="text-ink-muted text-base leading-relaxed text-pretty">{children}</p>;
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, index) => (
        <li key={index} className="text-ink-muted flex gap-3 text-base leading-relaxed text-pretty">
          <span aria-hidden="true" className="bg-gold-deep mt-2.5 size-1 shrink-0 rounded-full" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Champ restant a renseigner avant la mise en production. Signale visuellement
 * pour qu'aucun placeholder ne passe inapercu a la relecture, et annonce aux
 * lecteurs d'ecran qu'il s'agit d'une information manquante.
 */
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    /*
     * `text-inherit` est indispensable : <mark> force du noir sur jaune par
     * defaut, illisible dans l'en-tete sombre. En heritant, le champ reste
     * lisible sur ivoire comme sur navy.
     *
     * Le fond or reste a 12 % : au-dela, il eclaircit assez le fond clair pour
     * faire passer le gris secondaire sous le seuil AA de 4.5:1. C'est le
     * lisere, pas le fond, qui signale le champ.
     */
    <mark className="bg-gold/12 ring-gold/45 rounded px-1.5 py-0.5 font-medium text-inherit ring-1">
      <span className="sr-only">Information à compléter : </span>
      {children}
    </mark>
  );
}

/*
 * Rendu du texte legal stocke en donnees. Deux seules regles sont
 * interpretees, appliquees sur du texte brut : jamais de HTML injecte, ce qui
 * rend sûr l'affichage d'un contenu qui proviendra un jour d'une base et d'un
 * formulaire d'administration.
 *
 *   [TEXTE ENTRE CROCHETS]  ->  champ a completer, surligne
 *   **texte**               ->  gras
 */
const RICH_TEXT = /(\[[^\]]+\]|\*\*[^*]+\*\*)/g;

export function renderRichText(text: string): ReactNode[] {
  return text.split(RICH_TEXT).map((part, index) => {
    if (part.startsWith("[") && part.endsWith("]")) {
      return <Placeholder key={index}>{part}</Placeholder>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="text-ink font-medium">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

/**
 * Suite de lignes « libellé : valeur ».
 *
 * Encre pleine plutôt que grise : ces lignes portent des champs surlignés, sur
 * lesquels le gris secondaire tombe sous le seuil AA de 4.5:1.
 */
export function LegalFields({ fields }: { fields: { label?: string; value: string }[] }) {
  return (
    <div className="text-ink space-y-1.5 text-base leading-relaxed">
      {fields.map((field, index) => (
        <p key={index} className={field.label ? undefined : "font-medium"}>
          {field.label ? `${field.label} : ` : null}
          {renderRichText(field.value)}
        </p>
      ))}
    </div>
  );
}
