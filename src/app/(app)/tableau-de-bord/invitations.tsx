import { accepterInvitation, refuserInvitation } from "@/app/(app)/projets/actions-equipe";
import { ROLES_PROJET } from "@/lib/equipes";
import { createClient } from "@/lib/supabase/server";

/**
 * Invitations reçues, en tête du tableau de bord.
 *
 * C'est le seul endroit où une invitation se découvre tant qu'aucun e-mail
 * n'est envoyé : elle doit se voir avant tout le reste.
 */
export async function InvitationsRecues() {
  const supabase = await createClient();
  const { data: invitations } = await supabase.rpc("mes_invitations");

  if (!invitations?.length) {
    return null;
  }

  return (
    <section
      aria-labelledby="invitations-titre"
      className="border-gold/40 bg-gold/5 mt-10 rounded-xl border p-5 sm:p-6"
    >
      <h2 id="invitations-titre" className="font-serif text-xl leading-tight">
        {invitations.length > 1
          ? `${invitations.length} invitations en attente`
          : "Une invitation en attente"}
      </h2>

      <ul className="mt-5 space-y-4">
        {invitations.map((invitation) => (
          <li
            key={invitation.id}
            className="border-navy-line bg-navy flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
          >
            <div className="min-w-0">
              <p className="font-serif text-lg leading-snug text-pretty">
                {invitation.project_title}
              </p>
              <p className="text-light-muted mt-1 text-sm leading-relaxed">
                {invitation.invited_by_name
                  ? `${invitation.invited_by_name} vous invite`
                  : "Vous êtes invité"}{" "}
                comme {ROLES_PROJET[invitation.role].toLowerCase()}
                {invitation.job_title ? ` — ${invitation.job_title}` : null}.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <form action={accepterInvitation}>
                <input type="hidden" name="id" value={invitation.id} />
                <button
                  type="submit"
                  className="bg-gold text-navy hover:bg-gold-bright rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
                >
                  Accepter
                </button>
              </form>
              <form action={refuserInvitation}>
                <input type="hidden" name="id" value={invitation.id} />
                <button
                  type="submit"
                  className="border-navy-line hover:bg-navy-soft rounded-full border px-5 py-2.5 text-sm transition-colors"
                >
                  Refuser
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
