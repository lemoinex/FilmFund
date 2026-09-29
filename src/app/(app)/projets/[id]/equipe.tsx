import { BoutonConfirme } from "@/components/ui/confirmation";
import { lireAcces, ROLES_ATTRIBUABLES, ROLES_PROJET, type AccesProjet } from "@/lib/equipes";
import { createClient } from "@/lib/supabase/server";

import { annulerInvitation, changerRoleMembre, retirerMembre } from "../actions-equipe";
import { FormulaireInvitation } from "./invitation";

const dateFr = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

/**
 * Équipe du projet : membres, invitations en attente, formulaire d'invitation.
 *
 * Les commandes de gestion ne s'affichent qu'au porteur. Les masquer ne
 * protège rien — la RLS s'en charge —, cela évite seulement de proposer
 * des boutons qui échoueraient.
 */
export async function Equipe({
  projetId,
  acces,
  utilisateurId,
}: {
  projetId: string;
  acces: AccesProjet | null;
  utilisateurId: string;
}) {
  const supabase = await createClient();
  const estPorteur = acces === "owner";

  const [{ data: membres }, { data: invitations }] = await Promise.all([
    supabase.rpc("equipe_du_projet", { p_project_id: projetId }),
    estPorteur
      ? supabase
          .from("project_invitations")
          .select("id, email, role, job_title, created_at")
          .eq("project_id", projetId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <section
      id="equipe"
      aria-labelledby="equipe-titre"
      className="border-navy-line mt-16 scroll-mt-8 border-t pt-12"
    >
      <h2 id="equipe-titre" className="font-serif text-2xl leading-tight tracking-tight">
        Équipe
      </h2>
      <p className="text-light-muted mt-2 text-sm leading-relaxed">
        {estPorteur
          ? "Les éditeurs modifient le projet et son budget ; les lecteurs consultent le projet, sans accès au budget. Vous seul pouvez inviter, changer un rôle ou supprimer le projet."
          : "Les personnes qui travaillent sur ce projet."}
      </p>

      <ul className="border-navy-line mt-6 divide-y divide-[var(--navy-line)] rounded-xl border">
        {membres?.map((membre) => {
          const role = lireAcces(membre.role);
          const estMoi = membre.user_id === utilisateurId;
          const nom = membre.display_name.trim() || "Membre sans nom";

          return (
            <li
              key={membre.user_id}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4 sm:px-5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {nom}
                  {estMoi ? <span className="text-light-muted font-normal"> (vous)</span> : null}
                </p>
                <p className="text-light-muted mt-1 text-xs">
                  {membre.job_title ? `${membre.job_title} · ` : null}
                  {role === "owner" ? "Porteur depuis le" : "Membre depuis le"}{" "}
                  {dateFr.format(new Date(membre.depuis))}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {estPorteur && role !== "owner" ? (
                  <form
                    // Clé liée au rôle : après l'action, React réinitialise le
                    // formulaire à ses valeurs par défaut initiales et
                    // réafficherait l'ancien rôle. Le remonter prend en
                    // compte le rôle enregistré.
                    key={role}
                    action={changerRoleMembre}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="projet" value={projetId} />
                    <input type="hidden" name="membre" value={membre.user_id} />
                    <label htmlFor={`role-${membre.user_id}`} className="sr-only">
                      Rôle de {nom}
                    </label>
                    <select
                      id={`role-${membre.user_id}`}
                      name="role"
                      defaultValue={role ?? "viewer"}
                      className="border-navy-line bg-navy focus:border-gold rounded-lg border px-3 py-1.5 text-xs transition-colors outline-none"
                    >
                      {Object.keys(ROLES_ATTRIBUABLES).map((valeur) => (
                        <option key={valeur} value={valeur}>
                          {ROLES_PROJET[valeur as keyof typeof ROLES_ATTRIBUABLES]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="border-navy-line hover:bg-navy-soft rounded-full border px-3 py-1.5 text-xs transition-colors"
                    >
                      Appliquer
                    </button>
                  </form>
                ) : (
                  <span
                    className={`rounded px-2.5 py-1 text-xs ${
                      role === "owner" ? "text-gold bg-gold/10" : "bg-navy-soft text-light-muted"
                    }`}
                  >
                    {role ? ROLES_PROJET[role] : "—"}
                  </span>
                )}

                {estPorteur && role !== "owner" ? (
                  <BoutonConfirme
                    action={retirerMembre}
                    champs={{ projet: projetId, membre: membre.user_id }}
                    libelle="Retirer"
                    confirmation={`Retirer ${nom}`}
                    discret
                  />
                ) : null}

                {estMoi && role !== "owner" ? (
                  <BoutonConfirme
                    action={retirerMembre}
                    champs={{ projet: projetId, membre: membre.user_id }}
                    libelle="Quitter le projet"
                    confirmation="Confirmer le départ"
                    discret
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {estPorteur ? (
        <>
          {invitations?.length ? (
            <div className="mt-10">
              <h3 className="text-sm font-medium">Invitations en attente</h3>
              <ul className="border-navy-line mt-4 divide-y divide-[var(--navy-line)] rounded-xl border border-dashed">
                {invitations.map((invitation) => (
                  <li
                    key={invitation.id}
                    className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm break-all">{invitation.email}</p>
                      <p className="text-light-muted mt-1 text-xs">
                        {ROLES_PROJET[invitation.role]}
                        {invitation.job_title ? ` · ${invitation.job_title}` : null} · envoyée le{" "}
                        {dateFr.format(new Date(invitation.created_at))}
                      </p>
                    </div>
                    <BoutonConfirme
                      action={annulerInvitation}
                      champs={{ id: invitation.id, projet: projetId }}
                      libelle="Annuler"
                      confirmation="Annuler l'invitation"
                      discret
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-10">
            <h3 className="text-sm font-medium">Inviter un collaborateur</h3>
            <p className="text-light-muted mt-2 mb-5 text-sm leading-relaxed text-pretty">
              La personne invitée retrouve l&apos;invitation dans son tableau de bord et choisit de
              l&apos;accepter. Aucun e-mail n&apos;est envoyé pour l&apos;instant : prévenez-la
              vous-même.
            </p>
            <FormulaireInvitation projetId={projetId} />
          </div>
        </>
      ) : null}
    </section>
  );
}
