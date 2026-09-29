import { AfricaIcon, PeopleIcon, ShieldIcon, SparkIcon } from "@/components/icons";

/*
 * Formulations volontairement factuelles : aucune certification ni niveau de
 * securite n'est annonce tant qu'il n'a pas ete reellement mis en oeuvre.
 */
const VALUES = [
  {
    Icon: AfricaIcon,
    title: "Une plateforme dédiée",
    description: "Aux projets audiovisuels africains.",
  },
  {
    Icon: PeopleIcon,
    title: "Conçue pour les producteurs",
    description: "Et les professionnels du secteur.",
  },
  {
    Icon: SparkIcon,
    title: "Des outils d'IA",
    description: "Pour structurer vos projets.",
  },
  {
    Icon: ShieldIcon,
    title: "Une approche sécurisée",
    description: "Pour vos données.",
  },
];

export function ValueStrip() {
  return (
    <section aria-label="Ce que propose filmfundAfrica" className="bg-navy-soft">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-x-8 gap-y-8 px-5 py-10 sm:grid-cols-2 sm:px-8 lg:grid-cols-4 lg:py-12">
        {VALUES.map(({ Icon, title, description }) => (
          <div key={title} className="flex items-start gap-4">
            <Icon className="text-gold mt-0.5 size-7 shrink-0" />
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-light-muted mt-1 text-sm leading-relaxed">{description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
