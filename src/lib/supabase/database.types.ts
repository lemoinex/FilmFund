export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: boolean;
          private_admin_only: boolean;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          private_admin_only?: boolean;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          private_admin_only?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      budget_lines: {
        Row: {
          actual_amount: number | null;
          category: Database["public"]["Enums"]["budget_category"];
          created_at: string;
          created_by: string | null;
          id: string;
          label: string;
          project_id: string;
          quantity: number;
          total: number | null;
          unit_cost: number;
          updated_at: string;
        };
        Insert: {
          actual_amount?: number | null;
          category: Database["public"]["Enums"]["budget_category"];
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label: string;
          project_id: string;
          quantity?: number;
          total?: never;
          unit_cost: number;
          updated_at?: string;
        };
        Update: {
          actual_amount?: number | null;
          category?: Database["public"]["Enums"]["budget_category"];
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label?: string;
          project_id?: string;
          quantity?: number;
          total?: never;
          unit_cost?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "budget_lines_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budget_lines_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "project_budgets";
            referencedColumns: ["project_id"];
          },
        ];
      };
      funding_documents: {
        Row: {
          created_at: string;
          document_id: string;
          funding_id: string;
          project_id: string;
        };
        Insert: {
          created_at?: string;
          document_id: string;
          funding_id: string;
          project_id: string;
        };
        Update: {
          created_at?: string;
          document_id?: string;
          funding_id?: string;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "funding_documents_document_id_project_id_fkey";
            columns: ["document_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "project_documents";
            referencedColumns: ["id", "project_id"];
          },
          {
            foreignKeyName: "funding_documents_funding_id_project_id_fkey";
            columns: ["funding_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "project_fundings";
            referencedColumns: ["id", "project_id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string;
          id: string;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
      project_budgets: {
        Row: {
          created_at: string;
          currency: string;
          project_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency: string;
          project_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          project_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_budgets_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: true;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_documents: {
        Row: {
          content: string;
          created_at: string;
          created_by: string | null;
          id: string;
          project_id: string;
          status: Database["public"]["Enums"]["document_status"];
          title: string;
          type: Database["public"]["Enums"]["document_type"];
          updated_at: string;
        };
        Insert: {
          content?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          project_id: string;
          status?: Database["public"]["Enums"]["document_status"];
          title: string;
          type: Database["public"]["Enums"]["document_type"];
          updated_at?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          project_id?: string;
          status?: Database["public"]["Enums"]["document_status"];
          title?: string;
          type?: Database["public"]["Enums"]["document_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_documents_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_documents_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_fundings: {
        Row: {
          amount_granted: number | null;
          amount_requested: number | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          deadline: string | null;
          funder: string;
          id: string;
          kind: Database["public"]["Enums"]["funding_kind"];
          notes: string;
          program: string;
          project_id: string;
          status: Database["public"]["Enums"]["funding_status"];
          updated_at: string;
        };
        Insert: {
          amount_granted?: number | null;
          amount_requested?: number | null;
          created_at?: string;
          created_by?: string | null;
          currency: string;
          deadline?: string | null;
          funder: string;
          id?: string;
          kind?: Database["public"]["Enums"]["funding_kind"];
          notes?: string;
          program?: string;
          project_id: string;
          status?: Database["public"]["Enums"]["funding_status"];
          updated_at?: string;
        };
        Update: {
          amount_granted?: number | null;
          amount_requested?: number | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deadline?: string | null;
          funder?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["funding_kind"];
          notes?: string;
          program?: string;
          project_id?: string;
          status?: Database["public"]["Enums"]["funding_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_fundings_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_fundings_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_invitations: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          invited_by: string | null;
          job_title: string;
          project_id: string;
          role: Database["public"]["Enums"]["project_member_role"];
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          invited_by?: string | null;
          job_title?: string;
          project_id: string;
          role?: Database["public"]["Enums"]["project_member_role"];
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          invited_by?: string | null;
          job_title?: string;
          project_id?: string;
          role?: Database["public"]["Enums"]["project_member_role"];
        };
        Relationships: [
          {
            foreignKeyName: "project_invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_invitations_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_members: {
        Row: {
          added_by: string | null;
          created_at: string;
          job_title: string;
          project_id: string;
          role: Database["public"]["Enums"]["project_member_role"];
          user_id: string;
        };
        Insert: {
          added_by?: string | null;
          created_at?: string;
          job_title?: string;
          project_id: string;
          role?: Database["public"]["Enums"]["project_member_role"];
          user_id: string;
        };
        Update: {
          added_by?: string | null;
          created_at?: string;
          job_title?: string;
          project_id?: string;
          role?: Database["public"]["Enums"]["project_member_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_members_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_members_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      project_milestones: {
        Row: {
          created_at: string;
          created_by: string | null;
          due_on: string | null;
          id: string;
          notes: string;
          phase: Database["public"]["Enums"]["project_stage"];
          project_id: string;
          starts_on: string | null;
          status: Database["public"]["Enums"]["milestone_status"];
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          due_on?: string | null;
          id?: string;
          notes?: string;
          phase?: Database["public"]["Enums"]["project_stage"];
          project_id: string;
          starts_on?: string | null;
          status?: Database["public"]["Enums"]["milestone_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          due_on?: string | null;
          id?: string;
          notes?: string;
          phase?: Database["public"]["Enums"]["project_stage"];
          project_id?: string;
          starts_on?: string | null;
          status?: Database["public"]["Enums"]["milestone_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_milestones_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_milestones_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          created_at: string;
          format: Database["public"]["Enums"]["project_format"];
          id: string;
          logline: string;
          owner_id: string;
          stage: Database["public"]["Enums"]["project_stage"];
          synopsis: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          format?: Database["public"]["Enums"]["project_format"];
          id?: string;
          logline?: string;
          owner_id: string;
          stage?: Database["public"]["Enums"]["project_stage"];
          synopsis?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          format?: Database["public"]["Enums"]["project_format"];
          id?: string;
          logline?: string;
          owner_id?: string;
          stage?: Database["public"]["Enums"]["project_stage"];
          synopsis?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      storyboard_scenes: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string;
          id: string;
          location: string;
          position: number;
          project_id: string;
          setting: Database["public"]["Enums"]["scene_setting"];
          shot: Database["public"]["Enums"]["shot_type"] | null;
          time_of_day: Database["public"]["Enums"]["scene_time"];
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          location?: string;
          position: number;
          project_id: string;
          setting?: Database["public"]["Enums"]["scene_setting"];
          shot?: Database["public"]["Enums"]["shot_type"] | null;
          time_of_day?: Database["public"]["Enums"]["scene_time"];
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          location?: string;
          position?: number;
          project_id?: string;
          setting?: Database["public"]["Enums"]["scene_setting"];
          shot?: Database["public"]["Enums"]["shot_type"] | null;
          time_of_day?: Database["public"]["Enums"]["scene_time"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "storyboard_scenes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "storyboard_scenes_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accepter_invitation: { Args: { p_invitation_id: string }; Returns: string };
      acces_au_projet: { Args: { p_project_id: string }; Returns: string };
      definir_pieces_candidature: {
        Args: { p_document_ids: string[]; p_funding_id: string };
        Returns: undefined;
      };
      definir_role: {
        Args: { email_cible: string; nouveau_role: Database["public"]["Enums"]["user_role"] };
        Returns: undefined;
      };
      deplacer_scene: { Args: { p_scene_id: string; p_vers_le_haut: boolean }; Returns: undefined };
      email_confirme_courant: { Args: Record<PropertyKey, never>; Returns: string };
      equipe_du_projet: {
        Args: { p_project_id: string };
        Returns: {
          depuis: string;
          display_name: string;
          job_title: string;
          role: string;
          user_id: string;
        }[];
      };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      mes_invitations: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          id: string;
          invited_by_name: string;
          job_title: string;
          project_id: string;
          project_title: string;
          role: Database["public"]["Enums"]["project_member_role"];
        }[];
      };
      mode_prive: { Args: Record<PropertyKey, never>; Returns: boolean };
      peut_editer_contenu: { Args: { p_project_id: string }; Returns: boolean };
      peut_gerer_budget: { Args: { p_project_id: string }; Returns: boolean };
      refuser_invitation: { Args: { p_invitation_id: string }; Returns: undefined };
    };
    Enums: {
      budget_category:
        | "developpement"
        | "droits"
        | "equipe_technique"
        | "interpretation"
        | "decors_costumes"
        | "materiel"
        | "transport_regie"
        | "postproduction"
        | "assurances_divers"
        | "promotion_distribution"
        | "imprevus";
      document_status: "brouillon" | "en_relecture" | "finalise";
      document_type:
        "note_intention" | "traitement" | "scenario" | "biographie" | "lettre" | "autre";
      funding_kind:
        | "aide_publique"
        | "coproduction"
        | "preachat"
        | "mecenat"
        | "financement_participatif"
        | "residence"
        | "autre";
      funding_status: "a_preparer" | "deposee" | "acceptee" | "refusee";
      milestone_status: "a_faire" | "en_cours" | "termine";
      project_format:
        "long_metrage" | "court_metrage" | "documentaire" | "serie" | "web_serie" | "animation";
      project_member_role: "editor" | "viewer";
      project_stage:
        | "idee"
        | "developpement"
        | "ecriture"
        | "preproduction"
        | "production"
        | "postproduction"
        | "termine";
      scene_setting: "int" | "ext" | "int_ext";
      scene_time: "jour" | "nuit" | "aube" | "crepuscule";
      shot_type:
        | "plan_ensemble"
        | "plan_large"
        | "plan_moyen"
        | "plan_americain"
        | "plan_rapproche"
        | "gros_plan"
        | "tres_gros_plan"
        | "insert"
        | "plan_sequence";
      user_role: "member" | "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      budget_category: [
        "developpement",
        "droits",
        "equipe_technique",
        "interpretation",
        "decors_costumes",
        "materiel",
        "transport_regie",
        "postproduction",
        "assurances_divers",
        "promotion_distribution",
        "imprevus",
      ],
      document_status: ["brouillon", "en_relecture", "finalise"],
      document_type: ["note_intention", "traitement", "scenario", "biographie", "lettre", "autre"],
      funding_kind: [
        "aide_publique",
        "coproduction",
        "preachat",
        "mecenat",
        "financement_participatif",
        "residence",
        "autre",
      ],
      funding_status: ["a_preparer", "deposee", "acceptee", "refusee"],
      milestone_status: ["a_faire", "en_cours", "termine"],
      project_format: [
        "long_metrage",
        "court_metrage",
        "documentaire",
        "serie",
        "web_serie",
        "animation",
      ],
      project_member_role: ["editor", "viewer"],
      project_stage: [
        "idee",
        "developpement",
        "ecriture",
        "preproduction",
        "production",
        "postproduction",
        "termine",
      ],
      scene_setting: ["int", "ext", "int_ext"],
      scene_time: ["jour", "nuit", "aube", "crepuscule"],
      shot_type: [
        "plan_ensemble",
        "plan_large",
        "plan_moyen",
        "plan_americain",
        "plan_rapproche",
        "gros_plan",
        "tres_gros_plan",
        "insert",
        "plan_sequence",
      ],
      user_role: ["member", "admin"],
    },
  },
} as const;
