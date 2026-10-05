/**
 * Types de la base de données, à usage de l'application.
 *
 * `database.types.ts` est généré depuis le schéma par `npm run db:types` et ne
 * se modifie jamais à la main. Ce fichier-ci ne fait que le réexporter et lui
 * donner des noms courts : il reste stable même quand la génération change de
 * forme, ce qui évite de reprendre tous les imports à chaque régénération.
 */

import type { Database } from "./database.types";

export type { Database };

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];

export type UserRole = Enums<"user_role">;
export type ProfileType = Enums<"profile_type">;
export type ProjectFormat = Enums<"project_format">;
export type ProjectStage = Enums<"project_stage">;
export type ProjectMemberRole = Enums<"project_member_role">;
export type BudgetCategory = Enums<"budget_category">;
export type DocumentType = Enums<"document_type">;
export type DocumentStatus = Enums<"document_status">;
export type SceneSetting = Enums<"scene_setting">;
export type SceneTime = Enums<"scene_time">;
export type ShotType = Enums<"shot_type">;
export type ShotAngle = Enums<"shot_angle">;
export type ShotMovement = Enums<"shot_movement">;
export type GearCategory = Enums<"gear_category">;
export type MilestoneStatus = Enums<"milestone_status">;
export type FundingKind = Enums<"funding_kind">;
export type FundingStatus = Enums<"funding_status">;

export type Profile = Tables<"profiles">;
export type Project = Tables<"projects">;
export type ProjectCharacter = Tables<"project_characters">;
