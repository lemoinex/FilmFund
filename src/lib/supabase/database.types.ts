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
      admin_audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          details: NonNullable<Json>;
          id: number;
          project_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: never;
          project_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: never;
          project_id?: string | null;
        };
        Relationships: [];
      };
      ai_provider_keys: {
        Row: {
          configured_at: string;
          configured_by: string | null;
          provider: string;
          secret_id: string;
          updated_at: string;
        };
        Insert: {
          configured_at?: string;
          configured_by?: string | null;
          provider: string;
          secret_id: string;
          updated_at?: string;
        };
        Update: {
          configured_at?: string;
          configured_by?: string | null;
          provider?: string;
          secret_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_settings: {
        Row: {
          id: boolean;
          monthly_budget_usd: number;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          monthly_budget_usd: number;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          monthly_budget_usd?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_suggestion_budget_lines: {
        Row: {
          budget_line_id: string | null;
          category: Database["public"]["Enums"]["budget_category"];
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          label: string;
          position: number;
          project_id: string;
          quantity: number;
          state: string;
          suggestion_id: string;
          unit_cost: number;
        };
        Insert: {
          budget_line_id?: string | null;
          category: Database["public"]["Enums"]["budget_category"];
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          label: string;
          position: number;
          project_id: string;
          quantity: number;
          state?: string;
          suggestion_id: string;
          unit_cost: number;
        };
        Update: {
          budget_line_id?: string | null;
          category?: Database["public"]["Enums"]["budget_category"];
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          label?: string;
          position?: number;
          project_id?: string;
          quantity?: number;
          state?: string;
          suggestion_id?: string;
          unit_cost?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ai_suggestion_budget_lines_budget_line_id_fkey";
            columns: ["budget_line_id"];
            isOneToOne: false;
            referencedRelation: "budget_lines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_suggestion_budget_lines_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_suggestion_budget_lines_suggestion_id_fkey";
            columns: ["suggestion_id"];
            isOneToOne: false;
            referencedRelation: "ai_suggestions";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_suggestion_gear: {
        Row: {
          category: Database["public"]["Enums"]["gear_category"];
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          gear_id: string | null;
          id: string;
          label: string;
          position: number;
          project_id: string;
          quantity: number;
          simultaneous: boolean;
          state: string;
          suggestion_id: string;
          unit_power_watts: number | null;
        };
        Insert: {
          category: Database["public"]["Enums"]["gear_category"];
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          gear_id?: string | null;
          id?: string;
          label: string;
          position: number;
          project_id: string;
          quantity: number;
          simultaneous: boolean;
          state?: string;
          suggestion_id: string;
          unit_power_watts?: number | null;
        };
        Update: {
          category?: Database["public"]["Enums"]["gear_category"];
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          gear_id?: string | null;
          id?: string;
          label?: string;
          position?: number;
          project_id?: string;
          quantity?: number;
          simultaneous?: boolean;
          state?: string;
          suggestion_id?: string;
          unit_power_watts?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_suggestion_gear_gear_id_fkey";
            columns: ["gear_id"];
            isOneToOne: false;
            referencedRelation: "project_gear";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_suggestion_gear_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_suggestion_gear_suggestion_id_fkey";
            columns: ["suggestion_id"];
            isOneToOne: false;
            referencedRelation: "ai_suggestions";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_suggestion_images: {
        Row: {
          accepted_path: string | null;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          file: string;
          id: string;
          project_id: string;
          scene_id: string;
          size_bytes: number | null;
          state: string;
          suggestion_id: string;
        };
        Insert: {
          accepted_path?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          file: string;
          id?: string;
          project_id: string;
          scene_id: string;
          size_bytes?: never;
          state?: string;
          suggestion_id: string;
        };
        Update: {
          accepted_path?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          file?: string;
          id?: string;
          project_id?: string;
          scene_id?: string;
          size_bytes?: never;
          state?: string;
          suggestion_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_suggestion_images_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_suggestion_images_suggestion_id_fkey";
            columns: ["suggestion_id"];
            isOneToOne: true;
            referencedRelation: "ai_suggestions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "image_proposee_de_sa_scene";
            columns: ["scene_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "storyboard_scenes";
            referencedColumns: ["id", "project_id"];
          },
        ];
      };
      ai_suggestion_milestones: {
        Row: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          duration_days: number;
          id: string;
          milestone_id: string | null;
          phase: Database["public"]["Enums"]["project_stage"];
          position: number;
          project_id: string;
          state: string;
          suggestion_id: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          duration_days: number;
          id?: string;
          milestone_id?: string | null;
          phase: Database["public"]["Enums"]["project_stage"];
          position: number;
          project_id: string;
          state?: string;
          suggestion_id: string;
          title: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          duration_days?: number;
          id?: string;
          milestone_id?: string | null;
          phase?: Database["public"]["Enums"]["project_stage"];
          position?: number;
          project_id?: string;
          state?: string;
          suggestion_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_suggestion_milestones_milestone_id_fkey";
            columns: ["milestone_id"];
            isOneToOne: false;
            referencedRelation: "project_milestones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_suggestion_milestones_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_suggestion_milestones_suggestion_id_fkey";
            columns: ["suggestion_id"];
            isOneToOne: false;
            referencedRelation: "ai_suggestions";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_suggestion_opportunities: {
        Row: {
          category: string;
          collected_at: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          name: string;
          opportunity_id: string | null;
          organization: string;
          position: number;
          published_on: string | null;
          source_excerpt: string;
          source_title: string;
          source_url: string;
          state: string;
          suggestion_id: string;
          summary: string;
        };
        Insert: {
          category: string;
          collected_at: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          name: string;
          opportunity_id?: string | null;
          organization?: string;
          position: number;
          published_on?: string | null;
          source_excerpt: string;
          source_title: string;
          source_url: string;
          state?: string;
          suggestion_id: string;
          summary: string;
        };
        Update: {
          category?: string;
          collected_at?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          name?: string;
          opportunity_id?: string | null;
          organization?: string;
          position?: number;
          published_on?: string | null;
          source_excerpt?: string;
          source_title?: string;
          source_url?: string;
          state?: string;
          suggestion_id?: string;
          summary?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_suggestion_opportunities_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "funding_opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_suggestion_opportunities_suggestion_id_fkey";
            columns: ["suggestion_id"];
            isOneToOne: false;
            referencedRelation: "ai_suggestions";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_suggestion_shots: {
        Row: {
          angle: Database["public"]["Enums"]["shot_angle"];
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          description: string;
          duration_seconds: number | null;
          focal_mm: number | null;
          id: string;
          movement: Database["public"]["Enums"]["shot_movement"];
          position: number;
          project_id: string;
          scene_id: string;
          shot: Database["public"]["Enums"]["shot_type"];
          shot_id: string | null;
          state: string;
          suggestion_id: string;
        };
        Insert: {
          angle: Database["public"]["Enums"]["shot_angle"];
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          description?: string;
          duration_seconds?: number | null;
          focal_mm?: number | null;
          id?: string;
          movement: Database["public"]["Enums"]["shot_movement"];
          position: number;
          project_id: string;
          scene_id: string;
          shot: Database["public"]["Enums"]["shot_type"];
          shot_id?: string | null;
          state?: string;
          suggestion_id: string;
        };
        Update: {
          angle?: Database["public"]["Enums"]["shot_angle"];
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          description?: string;
          duration_seconds?: number | null;
          focal_mm?: number | null;
          id?: string;
          movement?: Database["public"]["Enums"]["shot_movement"];
          position?: number;
          project_id?: string;
          scene_id?: string;
          shot?: Database["public"]["Enums"]["shot_type"];
          shot_id?: string | null;
          state?: string;
          suggestion_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_suggestion_shots_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_suggestion_shots_shot_id_fkey";
            columns: ["shot_id"];
            isOneToOne: false;
            referencedRelation: "scene_shots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_suggestion_shots_suggestion_id_fkey";
            columns: ["suggestion_id"];
            isOneToOne: false;
            referencedRelation: "ai_suggestions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_propose_de_sa_scene";
            columns: ["scene_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "storyboard_scenes";
            referencedColumns: ["id", "project_id"];
          },
        ];
      };
      ai_suggestion_sources: {
        Row: {
          cited: boolean;
          collected_at: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          excerpt: string;
          id: string;
          position: number;
          project_id: string;
          published_on: string | null;
          site: string;
          source_id: string | null;
          state: string;
          suggestion_id: string;
          title: string;
          url: string;
        };
        Insert: {
          cited: boolean;
          collected_at: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          excerpt: string;
          id?: string;
          position: number;
          project_id: string;
          published_on?: string | null;
          site: string;
          source_id?: string | null;
          state?: string;
          suggestion_id: string;
          title: string;
          url: string;
        };
        Update: {
          cited?: boolean;
          collected_at?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          excerpt?: string;
          id?: string;
          position?: number;
          project_id?: string;
          published_on?: string | null;
          site?: string;
          source_id?: string | null;
          state?: string;
          suggestion_id?: string;
          title?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_suggestion_sources_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_suggestion_sources_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "project_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_suggestion_sources_suggestion_id_fkey";
            columns: ["suggestion_id"];
            isOneToOne: false;
            referencedRelation: "ai_suggestions";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_suggestions: {
        Row: {
          action: string;
          content: string;
          created_at: string;
          created_by: string;
          decided_at: string | null;
          decided_by: string | null;
          final_content: string | null;
          id: string;
          job_id: string;
          model: string;
          profile: string;
          project_id: string | null;
          replaced_content: string | null;
          state: string;
          studio_id: string | null;
        };
        Insert: {
          action: string;
          content: string;
          created_at?: string;
          created_by: string;
          decided_at?: string | null;
          decided_by?: string | null;
          final_content?: string | null;
          id?: string;
          job_id: string;
          model: string;
          profile: string;
          project_id?: string | null;
          replaced_content?: string | null;
          state?: string;
          studio_id?: string | null;
        };
        Update: {
          action?: string;
          content?: string;
          created_at?: string;
          created_by?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          final_content?: string | null;
          id?: string;
          job_id?: string;
          model?: string;
          profile?: string;
          project_id?: string | null;
          replaced_content?: string | null;
          state?: string;
          studio_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_suggestions_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: true;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_suggestions_studio_id_fkey";
            columns: ["studio_id"];
            isOneToOne: false;
            referencedRelation: "studios";
            referencedColumns: ["id"];
          },
        ];
      };
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
      funding_opportunities: {
        Row: {
          application_url: string | null;
          budget_max: number | null;
          budget_min: number | null;
          category: string;
          collected_on: string | null;
          countries: string[];
          created_at: string;
          created_by: string | null;
          currency: string | null;
          deadline: string | null;
          description: string;
          formats: Database["public"]["Enums"]["project_format"][];
          genres: string[];
          id: string;
          name: string;
          opens_on: string | null;
          organization: string;
          requirements: string;
          source_excerpt: string;
          source_url: string | null;
          status: string;
          updated_at: string;
          updated_by: string | null;
          website: string | null;
        };
        Insert: {
          application_url?: string | null;
          budget_max?: number | null;
          budget_min?: number | null;
          category: string;
          collected_on?: string | null;
          countries?: string[];
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          deadline?: string | null;
          description?: string;
          formats?: Database["public"]["Enums"]["project_format"][];
          genres?: string[];
          id?: string;
          name: string;
          opens_on?: string | null;
          organization: string;
          requirements?: string;
          source_excerpt?: string;
          source_url?: string | null;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
          website?: string | null;
        };
        Update: {
          application_url?: string | null;
          budget_max?: number | null;
          budget_min?: number | null;
          category?: string;
          collected_on?: string | null;
          countries?: string[];
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          deadline?: string | null;
          description?: string;
          formats?: Database["public"]["Enums"]["project_format"][];
          genres?: string[];
          id?: string;
          name?: string;
          opens_on?: string | null;
          organization?: string;
          requirements?: string;
          source_excerpt?: string;
          source_url?: string | null;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
          website?: string | null;
        };
        Relationships: [];
      };
      job_attempts: {
        Row: {
          created_at: string;
          error: string | null;
          finished_at: string | null;
          id: string;
          job_id: string;
          number: number;
          provider_ref: string | null;
          state: string;
          submitted_at: string | null;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          job_id: string;
          number: number;
          provider_ref?: string | null;
          state?: string;
          submitted_at?: string | null;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          job_id?: string;
          number?: number;
          provider_ref?: string | null;
          state?: string;
          submitted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "job_attempts_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          action: string;
          attempts: number;
          created_at: string;
          created_by: string;
          finished_at: string | null;
          id: string;
          lease_until: string | null;
          params: NonNullable<Json>;
          project_id: string | null;
          reason: string | null;
          reservation_id: string | null;
          state: string;
          studio_id: string | null;
          updated_at: string;
          worker: string | null;
        };
        Insert: {
          action: string;
          attempts?: number;
          created_at?: string;
          created_by: string;
          finished_at?: string | null;
          id?: string;
          lease_until?: string | null;
          params: NonNullable<Json>;
          project_id?: string | null;
          reason?: string | null;
          reservation_id?: string | null;
          state?: string;
          studio_id?: string | null;
          updated_at?: string;
          worker?: string | null;
        };
        Update: {
          action?: string;
          attempts?: number;
          created_at?: string;
          created_by?: string;
          finished_at?: string | null;
          id?: string;
          lease_until?: string | null;
          params?: NonNullable<Json>;
          project_id?: string | null;
          reason?: string | null;
          reservation_id?: string | null;
          state?: string;
          studio_id?: string | null;
          updated_at?: string;
          worker?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: true;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_studio_id_fkey";
            columns: ["studio_id"];
            isOneToOne: false;
            referencedRelation: "studios";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_versions: {
        Row: {
          id: string;
          images_per_month: number;
          max_members: number;
          max_projects: number;
          pdf_exports_per_month: number;
          plan_code: string;
          price_xaf_per_month: number;
          published_at: string;
          published_by: string | null;
          storage_mb: number;
          text_units_per_month: number;
          version_number: number;
        };
        Insert: {
          id?: string;
          images_per_month: number;
          max_members: number;
          max_projects: number;
          pdf_exports_per_month: number;
          plan_code: string;
          price_xaf_per_month: number;
          published_at?: string;
          published_by?: string | null;
          storage_mb: number;
          text_units_per_month: number;
          version_number?: number;
        };
        Update: {
          id?: string;
          images_per_month?: number;
          max_members?: number;
          max_projects?: number;
          pdf_exports_per_month?: number;
          plan_code?: string;
          price_xaf_per_month?: number;
          published_at?: string;
          published_by?: string | null;
          storage_mb?: number;
          text_units_per_month?: number;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "plan_versions_plan_code_fkey";
            columns: ["plan_code"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["code"];
          },
        ];
      };
      plans: {
        Row: {
          code: string;
          name: string;
          position: number;
        };
        Insert: {
          code: string;
          name: string;
          position: number;
        };
        Update: {
          code?: string;
          name?: string;
          position?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          city: string;
          country: string | null;
          created_at: string;
          display_name: string;
          first_name: string;
          id: string;
          last_name: string;
          profession: string;
          profile_type: Database["public"]["Enums"]["profile_type"] | null;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
        };
        Insert: {
          avatar_path?: string | null;
          city?: string;
          country?: string | null;
          created_at?: string;
          display_name?: string;
          first_name?: string;
          id: string;
          last_name?: string;
          profession?: string;
          profile_type?: Database["public"]["Enums"]["profile_type"] | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Update: {
          avatar_path?: string | null;
          city?: string;
          country?: string | null;
          created_at?: string;
          display_name?: string;
          first_name?: string;
          id?: string;
          last_name?: string;
          profession?: string;
          profile_type?: Database["public"]["Enums"]["profile_type"] | null;
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
      project_characters: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string;
          id: string;
          name: string;
          position: number;
          project_id: string;
          role: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          name: string;
          position?: number;
          project_id: string;
          role?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          name?: string;
          position?: number;
          project_id?: string;
          role?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_characters_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_characters_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_document_versions: {
        Row: {
          content: string;
          created_at: string;
          created_by: string | null;
          document_id: string;
          id: string;
          project_id: string;
          restored_from: number | null;
          title: string;
          version_number: number;
        };
        Insert: {
          content: string;
          created_at?: string;
          created_by?: string | null;
          document_id: string;
          id?: string;
          project_id: string;
          restored_from?: number | null;
          title: string;
          version_number: number;
        };
        Update: {
          content?: string;
          created_at?: string;
          created_by?: string | null;
          document_id?: string;
          id?: string;
          project_id?: string;
          restored_from?: number | null;
          title?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "version_du_document";
            columns: ["document_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "project_documents";
            referencedColumns: ["id", "project_id"];
          },
          {
            foreignKeyName: "version_restauree_existante";
            columns: ["document_id", "restored_from"];
            isOneToOne: false;
            referencedRelation: "project_document_versions";
            referencedColumns: ["document_id", "version_number"];
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
      project_exports: {
        Row: {
          content_fingerprint: string;
          created_at: string;
          created_by: string;
          expires_at: string;
          file: string;
          format: string;
          id: string;
          job_id: string;
          pages: number | null;
          params: NonNullable<Json>;
          project_id: string;
          size_bytes: number | null;
          studio_id: string;
        };
        Insert: {
          content_fingerprint: string;
          created_at?: string;
          created_by: string;
          expires_at?: string;
          file: string;
          format?: string;
          id?: string;
          job_id: string;
          pages?: number | null;
          params: NonNullable<Json>;
          project_id: string;
          size_bytes?: never;
          studio_id: string;
        };
        Update: {
          content_fingerprint?: string;
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          file?: string;
          format?: string;
          id?: string;
          job_id?: string;
          pages?: number | null;
          params?: NonNullable<Json>;
          project_id?: string;
          size_bytes?: never;
          studio_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_exports_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: true;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_exports_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_exports_studio_id_fkey";
            columns: ["studio_id"];
            isOneToOne: false;
            referencedRelation: "studios";
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
      project_gear: {
        Row: {
          category: Database["public"]["Enums"]["gear_category"];
          created_at: string;
          created_by: string | null;
          id: string;
          label: string;
          project_id: string;
          quantity: number;
          simultaneous: boolean;
          unit_power_watts: number | null;
          updated_at: string;
        };
        Insert: {
          category: Database["public"]["Enums"]["gear_category"];
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label: string;
          project_id: string;
          quantity?: number;
          simultaneous?: boolean;
          unit_power_watts?: number | null;
          updated_at?: string;
        };
        Update: {
          category?: Database["public"]["Enums"]["gear_category"];
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label?: string;
          project_id?: string;
          quantity?: number;
          simultaneous?: boolean;
          unit_power_watts?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_gear_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_gear_project_id_fkey";
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
      project_power_settings: {
        Row: {
          created_at: string;
          generator_margin_percent: number;
          project_id: string;
          updated_at: string;
          voltage_volts: number;
        };
        Insert: {
          created_at?: string;
          generator_margin_percent?: number;
          project_id: string;
          updated_at?: string;
          voltage_volts?: number;
        };
        Update: {
          created_at?: string;
          generator_margin_percent?: number;
          project_id?: string;
          updated_at?: string;
          voltage_volts?: number;
        };
        Relationships: [
          {
            foreignKeyName: "project_power_settings_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: true;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_sources: {
        Row: {
          collected_at: string;
          created_at: string;
          created_by: string | null;
          excerpt: string;
          id: string;
          project_id: string;
          published_on: string | null;
          question: string;
          site: string;
          status: string;
          title: string;
          url: string;
        };
        Insert: {
          collected_at: string;
          created_at?: string;
          created_by?: string | null;
          excerpt: string;
          id?: string;
          project_id: string;
          published_on?: string | null;
          question: string;
          site: string;
          status?: string;
          title: string;
          url: string;
        };
        Update: {
          collected_at?: string;
          created_at?: string;
          created_by?: string | null;
          excerpt?: string;
          id?: string;
          project_id?: string;
          published_on?: string | null;
          question?: string;
          site?: string;
          status?: string;
          title?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_sources_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_sources_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          artistic_vision: string;
          audience: string;
          countries: string[];
          cover_path: string | null;
          created_at: string;
          duration_minutes: number | null;
          format: Database["public"]["Enums"]["project_format"];
          genre: string | null;
          goals: string;
          id: string;
          languages: string;
          logline: string;
          owner_id: string;
          short_synopsis: string;
          stage: Database["public"]["Enums"]["project_stage"];
          stakes: string;
          studio_id: string;
          synopsis: string;
          theme: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          artistic_vision?: string;
          audience?: string;
          countries?: string[];
          cover_path?: string | null;
          created_at?: string;
          duration_minutes?: number | null;
          format?: Database["public"]["Enums"]["project_format"];
          genre?: string | null;
          goals?: string;
          id?: string;
          languages?: string;
          logline?: string;
          owner_id: string;
          short_synopsis?: string;
          stage?: Database["public"]["Enums"]["project_stage"];
          stakes?: string;
          studio_id?: string;
          synopsis?: string;
          theme?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          artistic_vision?: string;
          audience?: string;
          countries?: string[];
          cover_path?: string | null;
          created_at?: string;
          duration_minutes?: number | null;
          format?: Database["public"]["Enums"]["project_format"];
          genre?: string | null;
          goals?: string;
          id?: string;
          languages?: string;
          logline?: string;
          owner_id?: string;
          short_synopsis?: string;
          stage?: Database["public"]["Enums"]["project_stage"];
          stakes?: string;
          studio_id?: string;
          synopsis?: string;
          theme?: string;
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
          {
            foreignKeyName: "projects_studio_id_fkey";
            columns: ["studio_id"];
            isOneToOne: false;
            referencedRelation: "studios";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_charge_settlements: {
        Row: {
          attempt_id: string;
          fallback: boolean;
          input_tokens: number;
          model: string;
          output_tokens: number;
          settled_at: string;
          usd: number | null;
        };
        Insert: {
          attempt_id: string;
          fallback?: boolean;
          input_tokens: number;
          model: string;
          output_tokens: number;
          settled_at?: string;
          usd?: number | null;
        };
        Update: {
          attempt_id?: string;
          fallback?: boolean;
          input_tokens?: number;
          model?: string;
          output_tokens?: number;
          settled_at?: string;
          usd?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "provider_charge_settlements_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: true;
            referencedRelation: "provider_charges";
            referencedColumns: ["attempt_id"];
          },
        ];
      };
      provider_charges: {
        Row: {
          attempt_id: string;
          created_at: string;
          estimated_input_tokens: number;
          estimated_output_tokens: number;
          estimated_usd: number;
          job_id: string;
          model: string;
          profile: string;
          project_id: string | null;
          provider: string;
          studio_id: string | null;
        };
        Insert: {
          attempt_id: string;
          created_at?: string;
          estimated_input_tokens: number;
          estimated_output_tokens: number;
          estimated_usd: number;
          job_id: string;
          model: string;
          profile: string;
          project_id?: string | null;
          provider: string;
          studio_id?: string | null;
        };
        Update: {
          attempt_id?: string;
          created_at?: string;
          estimated_input_tokens?: number;
          estimated_output_tokens?: number;
          estimated_usd?: number;
          job_id?: string;
          model?: string;
          profile?: string;
          project_id?: string | null;
          provider?: string;
          studio_id?: string | null;
        };
        Relationships: [];
      };
      provider_search_charges: {
        Row: {
          attempt_id: string;
          created_at: string;
          estimated_requests: number;
          estimated_usd: number;
          job_id: string;
          profile: string;
          project_id: string | null;
          provider: string;
          studio_id: string | null;
        };
        Insert: {
          attempt_id: string;
          created_at?: string;
          estimated_requests: number;
          estimated_usd: number;
          job_id: string;
          profile: string;
          project_id?: string | null;
          provider: string;
          studio_id?: string | null;
        };
        Update: {
          attempt_id?: string;
          created_at?: string;
          estimated_requests?: number;
          estimated_usd?: number;
          job_id?: string;
          profile?: string;
          project_id?: string | null;
          provider?: string;
          studio_id?: string | null;
        };
        Relationships: [];
      };
      provider_search_settlements: {
        Row: {
          attempt_id: string;
          requests: number;
          settled_at: string;
          usd: number | null;
        };
        Insert: {
          attempt_id: string;
          requests: number;
          settled_at?: string;
          usd?: number | null;
        };
        Update: {
          attempt_id?: string;
          requests?: number;
          settled_at?: string;
          usd?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "provider_search_settlements_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: true;
            referencedRelation: "provider_search_charges";
            referencedColumns: ["attempt_id"];
          },
        ];
      };
      quotes: {
        Row: {
          action: string;
          created_at: string;
          created_by: string;
          expires_at: string;
          fingerprint: string;
          id: string;
          params: NonNullable<Json>;
          period_start: string;
          plan_version_id: string;
          project_id: string;
          quantity: number;
          rate_version_id: string | null;
          studio_id: string;
          unit: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          created_by: string;
          expires_at: string;
          fingerprint: string;
          id?: string;
          params?: NonNullable<Json>;
          period_start: string;
          plan_version_id: string;
          project_id: string;
          quantity: number;
          rate_version_id?: string | null;
          studio_id: string;
          unit: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          fingerprint?: string;
          id?: string;
          params?: NonNullable<Json>;
          period_start?: string;
          plan_version_id?: string;
          project_id?: string;
          quantity?: number;
          rate_version_id?: string | null;
          studio_id?: string;
          unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quotes_plan_version_id_fkey";
            columns: ["plan_version_id"];
            isOneToOne: false;
            referencedRelation: "plan_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotes_rate_version_id_fkey";
            columns: ["rate_version_id"];
            isOneToOne: false;
            referencedRelation: "text_unit_rate_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotes_studio_id_fkey";
            columns: ["studio_id"];
            isOneToOne: false;
            referencedRelation: "studios";
            referencedColumns: ["id"];
          },
        ];
      };
      readiness_weight_versions: {
        Row: {
          artistic_vision: number;
          budget: number;
          characters: number;
          concept: number;
          dossier: number;
          feasibility: number;
          financing: number;
          id: string;
          market: number;
          narrative: number;
          published_at: string;
          published_by: string | null;
          version_number: number;
        };
        Insert: {
          artistic_vision: number;
          budget: number;
          characters: number;
          concept: number;
          dossier: number;
          feasibility: number;
          financing: number;
          id?: string;
          market: number;
          narrative: number;
          published_at?: string;
          published_by?: string | null;
          version_number?: number;
        };
        Update: {
          artistic_vision?: number;
          budget?: number;
          characters?: number;
          concept?: number;
          dossier?: number;
          feasibility?: number;
          financing?: number;
          id?: string;
          market?: number;
          narrative?: number;
          published_at?: string;
          published_by?: string | null;
          version_number?: number;
        };
        Relationships: [];
      };
      reservation_settlements: {
        Row: {
          consumed: number;
          released: number | null;
          reservation_id: string;
          reserved: number;
          settled_at: string;
        };
        Insert: {
          consumed: number;
          released?: never;
          reservation_id: string;
          reserved: number;
          settled_at?: string;
        };
        Update: {
          consumed?: number;
          released?: never;
          reservation_id?: string;
          reserved?: number;
          settled_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reglement_de_la_reservation";
            columns: ["reservation_id", "reserved"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id", "quantity"];
          },
        ];
      };
      reservations: {
        Row: {
          action: string;
          created_at: string;
          created_by: string;
          fingerprint: string;
          id: string;
          idempotency_key: string;
          period_start: string;
          project_id: string;
          quantity: number;
          quote_id: string;
          studio_id: string;
          unit: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          created_by: string;
          fingerprint: string;
          id?: string;
          idempotency_key: string;
          period_start: string;
          project_id: string;
          quantity: number;
          quote_id: string;
          studio_id: string;
          unit: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          created_by?: string;
          fingerprint?: string;
          id?: string;
          idempotency_key?: string;
          period_start?: string;
          project_id?: string;
          quantity?: number;
          quote_id?: string;
          studio_id?: string;
          unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reservations_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: true;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservations_studio_id_fkey";
            columns: ["studio_id"];
            isOneToOne: false;
            referencedRelation: "studios";
            referencedColumns: ["id"];
          },
        ];
      };
      scene_shots: {
        Row: {
          angle: Database["public"]["Enums"]["shot_angle"];
          created_at: string;
          created_by: string | null;
          description: string;
          duration_seconds: number | null;
          focal_mm: number | null;
          id: string;
          movement: Database["public"]["Enums"]["shot_movement"];
          position: number;
          project_id: string;
          scene_id: string;
          shot: Database["public"]["Enums"]["shot_type"];
          updated_at: string;
        };
        Insert: {
          angle?: Database["public"]["Enums"]["shot_angle"];
          created_at?: string;
          created_by?: string | null;
          description?: string;
          duration_seconds?: number | null;
          focal_mm?: number | null;
          id?: string;
          movement?: Database["public"]["Enums"]["shot_movement"];
          position: number;
          project_id: string;
          scene_id: string;
          shot: Database["public"]["Enums"]["shot_type"];
          updated_at?: string;
        };
        Update: {
          angle?: Database["public"]["Enums"]["shot_angle"];
          created_at?: string;
          created_by?: string | null;
          description?: string;
          duration_seconds?: number | null;
          focal_mm?: number | null;
          id?: string;
          movement?: Database["public"]["Enums"]["shot_movement"];
          position?: number;
          project_id?: string;
          scene_id?: string;
          shot?: Database["public"]["Enums"]["shot_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_de_sa_scene";
            columns: ["scene_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "storyboard_scenes";
            referencedColumns: ["id", "project_id"];
          },
          {
            foreignKeyName: "scene_shots_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scene_shots_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
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
          image_path: string | null;
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
          image_path?: string | null;
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
          image_path?: string | null;
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
      studio_members: {
        Row: {
          created_at: string;
          role: Database["public"]["Enums"]["studio_role"];
          studio_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          role?: Database["public"]["Enums"]["studio_role"];
          studio_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          role?: Database["public"]["Enums"]["studio_role"];
          studio_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "studio_members_studio_id_fkey";
            columns: ["studio_id"];
            isOneToOne: false;
            referencedRelation: "studios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "studio_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      studio_subscriptions: {
        Row: {
          period_anchor: string;
          plan_code: string;
          studio_id: string;
          updated_at: string;
        };
        Insert: {
          period_anchor?: string;
          plan_code: string;
          studio_id: string;
          updated_at?: string;
        };
        Update: {
          period_anchor?: string;
          plan_code?: string;
          studio_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "studio_subscriptions_plan_code_fkey";
            columns: ["plan_code"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "studio_subscriptions_studio_id_fkey";
            columns: ["studio_id"];
            isOneToOne: true;
            referencedRelation: "studios";
            referencedColumns: ["id"];
          },
        ];
      };
      studios: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          personal_owner_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          personal_owner_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          personal_owner_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "studios_personal_owner_id_fkey";
            columns: ["personal_owner_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      text_unit_rate_versions: {
        Row: {
          bible: number;
          budget_plan: number;
          cultural_context: number;
          dialogue_per_scene: number;
          dramatic_analysis: number;
          gear_list: number;
          id: string;
          intention_note: number;
          logline: number;
          published_at: string;
          published_by: string | null;
          research: number;
          schedule_plan: number;
          screenplay_per_sequence: number;
          shot_list: number;
          synopsis_detailed: number;
          synopsis_short: number;
          synopsis_standard: number;
          treatment: number;
          version_number: number;
        };
        Insert: {
          bible: number;
          budget_plan: number;
          cultural_context: number;
          dialogue_per_scene: number;
          dramatic_analysis: number;
          gear_list: number;
          id?: string;
          intention_note: number;
          logline: number;
          published_at?: string;
          published_by?: string | null;
          research: number;
          schedule_plan: number;
          screenplay_per_sequence: number;
          shot_list: number;
          synopsis_detailed: number;
          synopsis_short: number;
          synopsis_standard: number;
          treatment: number;
          version_number?: number;
        };
        Update: {
          bible?: number;
          budget_plan?: number;
          cultural_context?: number;
          dialogue_per_scene?: number;
          dramatic_analysis?: number;
          gear_list?: number;
          id?: string;
          intention_note?: number;
          logline?: number;
          published_at?: string;
          published_by?: string | null;
          research?: number;
          schedule_plan?: number;
          screenplay_per_sequence?: number;
          shot_list?: number;
          synopsis_detailed?: number;
          synopsis_short?: number;
          synopsis_standard?: number;
          treatment?: number;
          version_number?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accepter_devis: {
        Args: { p_idempotency_key: string; p_quote_id: string };
        Returns: {
          action: string;
          created_at: string;
          created_by: string;
          fingerprint: string;
          id: string;
          idempotency_key: string;
          period_start: string;
          project_id: string;
          quantity: number;
          quote_id: string;
          studio_id: string;
          unit: string;
        };
        SetofOptions: {
          from: "*";
          to: "reservations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      accepter_image_proposee: { Args: { p_image_id: string; p_path: string }; Returns: string };
      accepter_invitation: { Args: { p_invitation_id: string }; Returns: string };
      accepter_jalon_propose: {
        Args: {
          p_due_on?: string;
          p_line_id: string;
          p_phase?: string;
          p_starts_on?: string;
          p_title?: string;
        };
        Returns: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          duration_days: number;
          id: string;
          milestone_id: string | null;
          phase: Database["public"]["Enums"]["project_stage"];
          position: number;
          project_id: string;
          state: string;
          suggestion_id: string;
          title: string;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_milestones";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      accepter_ligne_budget: {
        Args: {
          p_category?: string;
          p_label?: string;
          p_line_id: string;
          p_quantity?: number;
          p_unit_cost?: number;
        };
        Returns: {
          budget_line_id: string | null;
          category: Database["public"]["Enums"]["budget_category"];
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          label: string;
          position: number;
          project_id: string;
          quantity: number;
          state: string;
          suggestion_id: string;
          unit_cost: number;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_budget_lines";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      accepter_materiel_propose: {
        Args: { p_corrige?: Json; p_line_id: string };
        Returns: {
          category: Database["public"]["Enums"]["gear_category"];
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          gear_id: string | null;
          id: string;
          label: string;
          position: number;
          project_id: string;
          quantity: number;
          simultaneous: boolean;
          state: string;
          suggestion_id: string;
          unit_power_watts: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_gear";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      accepter_opportunite_proposee: {
        Args: { p_category?: string; p_line_id: string; p_name?: string; p_organization?: string };
        Returns: {
          category: string;
          collected_at: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          name: string;
          opportunity_id: string | null;
          organization: string;
          position: number;
          published_on: string | null;
          source_excerpt: string;
          source_title: string;
          source_url: string;
          state: string;
          suggestion_id: string;
          summary: string;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_opportunities";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      accepter_plan_propose: {
        Args: { p_corrige?: Json; p_line_id: string };
        Returns: {
          angle: Database["public"]["Enums"]["shot_angle"];
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          description: string;
          duration_seconds: number | null;
          focal_mm: number | null;
          id: string;
          movement: Database["public"]["Enums"]["shot_movement"];
          position: number;
          project_id: string;
          scene_id: string;
          shot: Database["public"]["Enums"]["shot_type"];
          shot_id: string | null;
          state: string;
          suggestion_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_shots";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      accepter_proposition: {
        Args: { p_content?: string; p_suggestion_id: string };
        Returns: {
          action: string;
          content: string;
          created_at: string;
          created_by: string;
          decided_at: string | null;
          decided_by: string | null;
          final_content: string | null;
          id: string;
          job_id: string;
          model: string;
          profile: string;
          project_id: string | null;
          replaced_content: string | null;
          state: string;
          studio_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      accepter_source_proposee: {
        Args: { p_line_id: string };
        Returns: {
          cited: boolean;
          collected_at: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          excerpt: string;
          id: string;
          position: number;
          project_id: string;
          published_on: string | null;
          site: string;
          source_id: string | null;
          state: string;
          suggestion_id: string;
          title: string;
          url: string;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_sources";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      acces_au_projet: { Args: { p_project_id: string }; Returns: string };
      allocation_du_plan: {
        Args: { p_plan: Database["public"]["Tables"]["plan_versions"]["Row"]; p_unit: string };
        Returns: number;
      };
      annuler_travail: {
        Args: { p_job_id: string };
        Returns: {
          action: string;
          attempts: number;
          created_at: string;
          created_by: string;
          finished_at: string | null;
          id: string;
          lease_until: string | null;
          params: NonNullable<Json>;
          project_id: string | null;
          reason: string | null;
          reservation_id: string | null;
          state: string;
          studio_id: string | null;
          updated_at: string;
          worker: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "jobs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      bareme_en_vigueur: {
        Args: { p_studio_id: string };
        Returns: {
          bible: number;
          budget_plan: number;
          cultural_context: number;
          dialogue_per_scene: number;
          dramatic_analysis: number;
          gear_list: number;
          id: string;
          intention_note: number;
          logline: number;
          published_at: string;
          published_by: string | null;
          research: number;
          schedule_plan: number;
          screenplay_per_sequence: number;
          shot_list: number;
          synopsis_detailed: number;
          synopsis_short: number;
          synopsis_standard: number;
          treatment: number;
          version_number: number;
        };
        SetofOptions: {
          from: "*";
          to: "text_unit_rate_versions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      cle_fournisseur: { Args: { p_provider: string }; Returns: string };
      clore_proposition_budget: { Args: { p_suggestion_id: string }; Returns: undefined };
      clore_proposition_decoupage: { Args: { p_suggestion_id: string }; Returns: undefined };
      clore_proposition_materiel: { Args: { p_suggestion_id: string }; Returns: undefined };
      clore_proposition_planning: { Args: { p_suggestion_id: string }; Returns: undefined };
      clore_proposition_recherche: { Args: { p_suggestion_id: string }; Returns: undefined };
      clore_proposition_veille: { Args: { p_suggestion_id: string }; Returns: undefined };
      clore_travail: {
        Args: {
          p_consumed: number;
          p_job: Database["public"]["Tables"]["jobs"]["Row"];
          p_reason: string;
          p_state: string;
        };
        Returns: {
          action: string;
          attempts: number;
          created_at: string;
          created_by: string;
          finished_at: string | null;
          id: string;
          lease_until: string | null;
          params: NonNullable<Json>;
          project_id: string | null;
          reason: string | null;
          reservation_id: string | null;
          state: string;
          studio_id: string | null;
          updated_at: string;
          worker: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "jobs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      comptes_administration: {
        Args: { p_compte?: string; p_decalage?: number; p_limite?: number; p_recherche?: string };
        Returns: {
          country: string;
          cree_le: string;
          derniere_connexion: string;
          display_name: string;
          email: string;
          email_confirme: boolean;
          id: string;
          profile_type: Database["public"]["Enums"]["profile_type"];
          role: Database["public"]["Enums"]["user_role"];
          total: number;
        }[];
      };
      confirmer_cout: {
        Args: {
          p_attempt_id: string;
          p_fallback?: boolean;
          p_input_tokens: number;
          p_model: string;
          p_output_tokens: number;
          p_usd: number;
        };
        Returns: {
          attempt_id: string;
          fallback: boolean;
          input_tokens: number;
          model: string;
          output_tokens: number;
          settled_at: string;
          usd: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "provider_charge_settlements";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      confirmer_recherche: {
        Args: { p_attempt_id: string; p_requests: number; p_usd: number };
        Returns: {
          attempt_id: string;
          requests: number;
          settled_at: string;
          usd: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "provider_search_settlements";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      contenu_dossier: { Args: { p_params: Json; p_project_id: string }; Returns: Json };
      contexte_budget: { Args: { p_attempt_id: string }; Returns: Json };
      contexte_decoupage: { Args: { p_attempt_id: string }; Returns: Json };
      contexte_dialogue: { Args: { p_attempt_id: string }; Returns: Json };
      contexte_export: { Args: { p_attempt_id: string }; Returns: Json };
      contexte_image: { Args: { p_attempt_id: string }; Returns: Json };
      contexte_materiel: { Args: { p_attempt_id: string }; Returns: Json };
      contexte_planning: { Args: { p_attempt_id: string }; Returns: Json };
      contexte_recherche: { Args: { p_attempt_id: string }; Returns: Json };
      contexte_redaction: { Args: { p_attempt_id: string }; Returns: Json };
      contexte_travail: {
        Args: { p_attempt_id: string };
        Returns: {
          format: string;
          logline: string;
          stage: string;
          synopsis: string;
          title: string;
        }[];
      };
      contexte_veille: { Args: { p_attempt_id: string }; Returns: Json };
      creer_devis: {
        Args: { p_action: string; p_params?: Json; p_project_id: string };
        Returns: {
          allowance: number;
          available: number;
          expires_at: string;
          quantity: number;
          quote_id: string;
          unit: string;
        }[];
      };
      debut_periode: { Args: { p_ancre: string; p_instant?: string }; Returns: string };
      definir_cle_fournisseur: {
        Args: { p_cle: string; p_provider: string };
        Returns: {
          configured_at: string;
          configured_by: string | null;
          provider: string;
          secret_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "ai_provider_keys";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      definir_pieces_candidature: {
        Args: { p_document_ids: string[]; p_funding_id: string };
        Returns: undefined;
      };
      definir_role: {
        Args: { email_cible: string; nouveau_role: Database["public"]["Enums"]["user_role"] };
        Returns: undefined;
      };
      demander_veille: { Args: { p_question: string }; Returns: string };
      depense_ia_du_mois: { Args: Record<PropertyKey, never>; Returns: number };
      deplacer_plan: { Args: { p_plan_id: string; p_vers_le_haut: boolean }; Returns: undefined };
      deplacer_scene: { Args: { p_scene_id: string; p_vers_le_haut: boolean }; Returns: undefined };
      duree_bail_travail: { Args: Record<PropertyKey, never>; Returns: string };
      duree_validite_devis: { Args: Record<PropertyKey, never>; Returns: string };
      ecarter_image_proposee: { Args: { p_image_id: string }; Returns: undefined };
      ecarter_jalon_propose: {
        Args: { p_line_id: string };
        Returns: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          duration_days: number;
          id: string;
          milestone_id: string | null;
          phase: Database["public"]["Enums"]["project_stage"];
          position: number;
          project_id: string;
          state: string;
          suggestion_id: string;
          title: string;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_milestones";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      ecarter_ligne_budget: {
        Args: { p_line_id: string };
        Returns: {
          budget_line_id: string | null;
          category: Database["public"]["Enums"]["budget_category"];
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          label: string;
          position: number;
          project_id: string;
          quantity: number;
          state: string;
          suggestion_id: string;
          unit_cost: number;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_budget_lines";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      ecarter_materiel_propose: {
        Args: { p_line_id: string };
        Returns: {
          category: Database["public"]["Enums"]["gear_category"];
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          gear_id: string | null;
          id: string;
          label: string;
          position: number;
          project_id: string;
          quantity: number;
          simultaneous: boolean;
          state: string;
          suggestion_id: string;
          unit_power_watts: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_gear";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      ecarter_opportunite_proposee: {
        Args: { p_line_id: string };
        Returns: {
          category: string;
          collected_at: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          name: string;
          opportunity_id: string | null;
          organization: string;
          position: number;
          published_on: string | null;
          source_excerpt: string;
          source_title: string;
          source_url: string;
          state: string;
          suggestion_id: string;
          summary: string;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_opportunities";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      ecarter_plan_propose: {
        Args: { p_line_id: string };
        Returns: {
          angle: Database["public"]["Enums"]["shot_angle"];
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          description: string;
          duration_seconds: number | null;
          focal_mm: number | null;
          id: string;
          movement: Database["public"]["Enums"]["shot_movement"];
          position: number;
          project_id: string;
          scene_id: string;
          shot: Database["public"]["Enums"]["shot_type"];
          shot_id: string | null;
          state: string;
          suggestion_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_shots";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      ecarter_proposition: {
        Args: { p_suggestion_id: string };
        Returns: {
          action: string;
          content: string;
          created_at: string;
          created_by: string;
          decided_at: string | null;
          decided_by: string | null;
          final_content: string | null;
          id: string;
          job_id: string;
          model: string;
          profile: string;
          project_id: string | null;
          replaced_content: string | null;
          state: string;
          studio_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      ecarter_source_proposee: {
        Args: { p_line_id: string };
        Returns: {
          cited: boolean;
          collected_at: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          excerpt: string;
          id: string;
          position: number;
          project_id: string;
          published_on: string | null;
          site: string;
          source_id: string | null;
          state: string;
          suggestion_id: string;
          title: string;
          url: string;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_sources";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      email_confirme_courant: { Args: Record<PropertyKey, never>; Returns: string };
      empreinte_contenu: { Args: { p_contenu: Json }; Returns: string };
      empreinte_demande: {
        Args: { p_action: string; p_params: Json; p_project_id: string };
        Returns: string;
      };
      empreinte_dossier: { Args: { p_params: Json; p_project_id: string }; Returns: string };
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
      essai_courant: {
        Args: { p_attempt_id: string };
        Returns: {
          created_at: string;
          error: string | null;
          finished_at: string | null;
          id: string;
          job_id: string;
          number: number;
          provider_ref: string | null;
          state: string;
          submitted_at: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "job_attempts";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      export_disponible: {
        Args: { p_format?: string; p_params: Json; p_project_id: string };
        Returns: string;
      };
      faits_maturite: { Args: { p_project_id: string }; Returns: Json };
      faits_maturite_projets: {
        Args: { p_project_ids: string[] };
        Returns: {
          faits: Json;
          project_id: string;
        }[];
      };
      image_a_decider: {
        Args: { p_image_id: string };
        Returns: {
          accepted_path: string | null;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          file: string;
          id: string;
          project_id: string;
          scene_id: string;
          size_bytes: number | null;
          state: string;
          suggestion_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_images";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      images_orphelines: { Args: { p_project_id: string }; Returns: string[] };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      jalon_a_decider: {
        Args: { p_line_id: string };
        Returns: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          duration_days: number;
          id: string;
          milestone_id: string | null;
          phase: Database["public"]["Enums"]["project_stage"];
          position: number;
          project_id: string;
          state: string;
          suggestion_id: string;
          title: string;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_milestones";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      journaliser: {
        Args: { p_action: string; p_details: Json; p_project_id: string };
        Returns: undefined;
      };
      ligne_budget_a_decider: {
        Args: { p_line_id: string };
        Returns: {
          budget_line_id: string | null;
          category: Database["public"]["Enums"]["budget_category"];
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          label: string;
          position: number;
          project_id: string;
          quantity: number;
          state: string;
          suggestion_id: string;
          unit_cost: number;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_budget_lines";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      livrer_export: {
        Args: { p_attempt_id: string; p_file: string; p_fingerprint: string; p_pages: number };
        Returns: string;
      };
      livrer_proposition: { Args: { p_attempt_id: string; p_content: string }; Returns: string };
      livrer_proposition_budget: { Args: { p_attempt_id: string; p_lines: Json }; Returns: string };
      livrer_proposition_decoupage: {
        Args: { p_attempt_id: string; p_lines: Json };
        Returns: string;
      };
      livrer_proposition_image: { Args: { p_attempt_id: string; p_file: string }; Returns: string };
      livrer_proposition_materiel: {
        Args: { p_attempt_id: string; p_lines: Json };
        Returns: string;
      };
      livrer_proposition_planning: {
        Args: { p_attempt_id: string; p_lines: Json };
        Returns: string;
      };
      livrer_proposition_recherche: {
        Args: { p_attempt_id: string; p_content: string; p_sources: Json };
        Returns: string;
      };
      livrer_proposition_veille: {
        Args: { p_attempt_id: string; p_opportunities: Json; p_sources: Json };
        Returns: string;
      };
      marquer_tentative_soumise: {
        Args: { p_attempt_id: string; p_provider_ref?: string };
        Returns: {
          created_at: string;
          error: string | null;
          finished_at: string | null;
          id: string;
          job_id: string;
          number: number;
          provider_ref: string | null;
          state: string;
          submitted_at: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "job_attempts";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      materiel_a_decider: {
        Args: { p_line_id: string };
        Returns: {
          category: Database["public"]["Enums"]["gear_category"];
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          gear_id: string | null;
          id: string;
          label: string;
          position: number;
          project_id: string;
          quantity: number;
          simultaneous: boolean;
          state: string;
          suggestion_id: string;
          unit_power_watts: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_gear";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
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
      octets_du_studio: { Args: { p_studio_id: string }; Returns: number };
      opportunite_a_decider: {
        Args: { p_line_id: string };
        Returns: {
          category: string;
          collected_at: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          name: string;
          opportunity_id: string | null;
          organization: string;
          position: number;
          published_on: string | null;
          source_excerpt: string;
          source_title: string;
          source_url: string;
          state: string;
          suggestion_id: string;
          summary: string;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_opportunities";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      parametre_entier: {
        Args: { p_cle: string; p_maximum: number; p_params: Json };
        Returns: number;
      };
      parametres_export: { Args: { p_params: Json }; Returns: Json };
      passage_du_scenario: { Args: { p_params: Json; p_project_id: string }; Returns: string };
      peut_editer_contenu: { Args: { p_project_id: string }; Returns: boolean };
      peut_engager_unites: { Args: { p_project_id: string }; Returns: boolean };
      peut_engager_unites_pour: {
        Args: { p_project_id: string; p_user: string };
        Returns: boolean;
      };
      peut_gerer_budget: { Args: { p_project_id: string }; Returns: boolean };
      plan_a_decider: {
        Args: { p_line_id: string };
        Returns: {
          angle: Database["public"]["Enums"]["shot_angle"];
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          description: string;
          duration_seconds: number | null;
          focal_mm: number | null;
          id: string;
          movement: Database["public"]["Enums"]["shot_movement"];
          position: number;
          project_id: string;
          scene_id: string;
          shot: Database["public"]["Enums"]["shot_type"];
          shot_id: string | null;
          state: string;
          suggestion_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_shots";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      plan_en_vigueur: {
        Args: { p_studio_id: string };
        Returns: {
          id: string;
          images_per_month: number;
          max_members: number;
          max_projects: number;
          pdf_exports_per_month: number;
          plan_code: string;
          price_xaf_per_month: number;
          published_at: string;
          published_by: string | null;
          storage_mb: number;
          text_units_per_month: number;
          version_number: number;
        };
        SetofOptions: {
          from: "*";
          to: "plan_versions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      projet_du_chemin: { Args: { p_chemin: string }; Returns: string };
      prolonger_bail: { Args: { p_attempt_id: string }; Returns: boolean };
      provisionner_cout: {
        Args: {
          p_attempt_id: string;
          p_input_tokens: number;
          p_model: string;
          p_output_tokens: number;
          p_profile: string;
          p_provider: string;
          p_usd: number;
        };
        Returns: {
          attempt_id: string;
          created_at: string;
          estimated_input_tokens: number;
          estimated_output_tokens: number;
          estimated_usd: number;
          job_id: string;
          model: string;
          profile: string;
          project_id: string | null;
          provider: string;
          studio_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "provider_charges";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      provisionner_recherche: {
        Args: {
          p_attempt_id: string;
          p_profile: string;
          p_provider: string;
          p_requests: number;
          p_reserve_usd: number;
          p_usd: number;
        };
        Returns: {
          attempt_id: string;
          created_at: string;
          estimated_requests: number;
          estimated_usd: number;
          job_id: string;
          profile: string;
          project_id: string | null;
          provider: string;
          studio_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "provider_search_charges";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      purger_exports_expires: { Args: Record<PropertyKey, never>; Returns: number };
      rapprocher_travail: {
        Args: { p_consumed?: number; p_job_id: string; p_success: boolean };
        Returns: {
          action: string;
          attempts: number;
          created_at: string;
          created_by: string;
          finished_at: string | null;
          id: string;
          lease_until: string | null;
          params: NonNullable<Json>;
          project_id: string | null;
          reason: string | null;
          reservation_id: string | null;
          state: string;
          studio_id: string | null;
          updated_at: string;
          worker: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "jobs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rapprocher_travail_admin: {
        Args: { p_consumed?: number; p_job_id: string; p_success: boolean };
        Returns: {
          action: string;
          attempts: number;
          created_at: string;
          created_by: string;
          finished_at: string | null;
          id: string;
          lease_until: string | null;
          params: NonNullable<Json>;
          project_id: string | null;
          reason: string | null;
          reservation_id: string | null;
          state: string;
          studio_id: string | null;
          updated_at: string;
          worker: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "jobs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reclamer_travail: {
        Args: { p_actions: string[]; p_worker: string };
        Returns: {
          action: string;
          attempt_id: string;
          attempt_number: number;
          job_id: string;
          lease_until: string;
          params: Json;
          project_id: string;
          studio_id: string;
        }[];
      };
      recuperer_travaux_expires: { Args: Record<PropertyKey, never>; Returns: number };
      refuser_invitation: { Args: { p_invitation_id: string }; Returns: undefined };
      regler_reservation: {
        Args: { p_consumed: number; p_reservation_id: string };
        Returns: {
          consumed: number;
          released: number | null;
          reservation_id: string;
          reserved: number;
          settled_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "reservation_settlements";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      restaurer_version_document: { Args: { p_version_id: string }; Returns: undefined };
      retirer_cle_fournisseur: { Args: { p_provider: string }; Returns: undefined };
      role_dans_studio: { Args: { p_studio_id: string }; Returns: string };
      source_a_decider: {
        Args: { p_line_id: string };
        Returns: {
          cited: boolean;
          collected_at: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          excerpt: string;
          id: string;
          position: number;
          project_id: string;
          published_on: string | null;
          site: string;
          source_id: string | null;
          state: string;
          suggestion_id: string;
          title: string;
          url: string;
        };
        SetofOptions: {
          from: "*";
          to: "ai_suggestion_sources";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      studio_personnel_courant: { Args: Record<PropertyKey, never>; Returns: string };
      terminer_tentative: {
        Args: { p_attempt_id: string; p_consumed?: number; p_error?: string; p_success: boolean };
        Returns: {
          action: string;
          attempts: number;
          created_at: string;
          created_by: string;
          finished_at: string | null;
          id: string;
          lease_until: string | null;
          params: NonNullable<Json>;
          project_id: string | null;
          reason: string | null;
          reservation_id: string | null;
          state: string;
          studio_id: string | null;
          updated_at: string;
          worker: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "jobs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      trancher_rapprochement: {
        Args: { p_consumed: number; p_job_id: string; p_success: boolean };
        Returns: {
          action: string;
          attempts: number;
          created_at: string;
          created_by: string;
          finished_at: string | null;
          id: string;
          lease_until: string | null;
          params: NonNullable<Json>;
          project_id: string | null;
          reason: string | null;
          reservation_id: string | null;
          state: string;
          studio_id: string | null;
          updated_at: string;
          worker: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "jobs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      unites_engagees: {
        Args: { p_period_start: string; p_studio_id: string; p_unit: string };
        Returns: number;
      };
      veilles_par_jour: { Args: Record<PropertyKey, never>; Returns: number };
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
        | "note_intention"
        | "synopsis"
        | "traitement"
        | "bible"
        | "scenario"
        | "biographie"
        | "lettre"
        | "analyse"
        | "autre";
      funding_kind:
        | "aide_publique"
        | "coproduction"
        | "preachat"
        | "mecenat"
        | "financement_participatif"
        | "residence"
        | "autre";
      funding_status: "a_preparer" | "deposee" | "acceptee" | "refusee";
      gear_category: "image" | "lumiere" | "son" | "machinerie" | "energie" | "regie";
      milestone_status: "a_faire" | "en_cours" | "termine";
      profile_type: "AUTHOR" | "DIRECTOR" | "PRODUCER";
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
      shot_angle: "normal" | "plongee" | "contre_plongee";
      shot_movement: "fixe" | "panoramique" | "travelling" | "epaule" | "autre";
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
      studio_role: "owner" | "member";
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
      document_type: [
        "note_intention",
        "synopsis",
        "traitement",
        "bible",
        "scenario",
        "biographie",
        "lettre",
        "analyse",
        "autre",
      ],
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
      gear_category: ["image", "lumiere", "son", "machinerie", "energie", "regie"],
      milestone_status: ["a_faire", "en_cours", "termine"],
      profile_type: ["AUTHOR", "DIRECTOR", "PRODUCER"],
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
      shot_angle: ["normal", "plongee", "contre_plongee"],
      shot_movement: ["fixe", "panoramique", "travelling", "epaule", "autre"],
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
      studio_role: ["owner", "member"],
      user_role: ["member", "admin"],
    },
  },
} as const;
