import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { DUREE_LIEN_SECONDES } from "@/lib/images";
import { COMPARTIMENT_PHOTOS } from "@/lib/photos";
import { listerPays } from "@/lib/profils";
import { createClient } from "@/lib/supabase/server";

import { FormulaireProfil } from "./formulaire";
import { Avatar, EnvoiPhoto } from "./photo";

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
    .select(
      "display_name, first_name, last_name, country, city, profession, profile_type, avatar_path",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profil) {
    notFound();
  }

  const { avatar_path: cheminPhoto, ...saisie } = profil;
  // Lien délivré avec la session : la politique de stockage décide. Refusé
  // ou introuvable, il manque, et les initiales tiennent la place.
  const { data: lien } = cheminPhoto
    ? await supabase.storage
        .from(COMPARTIMENT_PHOTOS)
        .createSignedUrl(cheminPhoto, DUREE_LIEN_SECONDES)
    : { data: null };

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">Mon profil</h1>
      <p className="text-secondary mt-3 text-sm leading-relaxed text-pretty">
        Ces informations ne sont visibles que de vous et des administrateurs. Vos équipes ne voient
        que votre nom affiché.
      </p>

      <section aria-labelledby="photo-titre" className="mt-8 flex flex-wrap items-center gap-5">
        <Avatar url={lien?.signedUrl} nom={saisie.display_name} taille="grande" />
        <div className="min-w-0 flex-1 space-y-3">
          <h2 id="photo-titre" className="text-sm font-medium">
            Photo
          </h2>
          <EnvoiPhoto compteId={user.id} aPhoto={Boolean(cheminPhoto)} />
        </div>
      </section>

      <dl className="border-app-line mt-8 rounded-xl border px-5 py-4">
        <dt className="text-secondary text-xs">Adresse e-mail</dt>
        <dd className="mt-1 text-sm break-words">{user.email}</dd>
        <dd className="text-secondary mt-2 text-xs leading-relaxed">
          Elle sert à vous connecter et ne se modifie pas ici.
        </dd>
      </dl>

      <div className="mt-10">
        {/* Noms et ordre des pays calculés ici, côté serveur, puis passés tels quels. */}
        <FormulaireProfil profil={saisie} pays={listerPays()} />
      </div>
    </div>
  );
}
