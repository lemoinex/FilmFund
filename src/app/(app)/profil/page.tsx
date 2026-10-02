import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { listerPays } from "@/lib/profils";
import { createClient } from "@/lib/supabase/server";

import { FormulaireProfil } from "./formulaire";

export const metadata: Metadata = {
  title: "Mon profil — filmfundAfrica",
  robots: { index: false, follow: false },
};

export default async function ProfilPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  // Le profil de la session, et lui seul : un administrateur lirait sinon
  // tous les profils, que la RLS lui ouvre.
  const { data: profil } = await supabase
    .from("profiles")
    .select("display_name, first_name, last_name, country, city, profession, profile_type")
    .eq("id", user.id)
    .maybeSingle();

  if (!profil) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">Mon profil</h1>
      <p className="text-secondary mt-3 text-sm leading-relaxed text-pretty">
        Ces informations ne sont visibles que de vous et des administrateurs. Vos équipes ne voient
        que votre nom affiché.
      </p>

      <dl className="border-app-line mt-8 rounded-xl border px-5 py-4">
        <dt className="text-secondary text-xs">Adresse e-mail</dt>
        <dd className="mt-1 text-sm break-words">{user.email}</dd>
        <dd className="text-secondary mt-2 text-xs leading-relaxed">
          Elle sert à vous connecter et ne se modifie pas ici.
        </dd>
      </dl>

      <div className="mt-10">
        {/* Noms et ordre des pays calculés ici, côté serveur, puis passés tels quels. */}
        <FormulaireProfil profil={profil} pays={listerPays()} />
      </div>
    </div>
  );
}
