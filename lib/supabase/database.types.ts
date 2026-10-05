export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          archived: boolean
          color: string
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          initial_balance_cents: number
          initial_balance_date: string
          institution: string | null
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          color: string
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          initial_balance_cents?: number
          initial_balance_date: string
          institution?: string | null
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          color?: string
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          initial_balance_cents?: number
          initial_balance_date?: string
          institution?: string | null
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      card_invoices: {
        Row: {
          closing_date: string
          closing_month: string
          created_at: string
          created_by: string | null
          credit_card_id: string
          due_date: string
          household_id: string
          id: string
          reference_month: string
          updated_at: string
        }
        Insert: {
          closing_date: string
          closing_month: string
          created_at?: string
          created_by?: string | null
          credit_card_id: string
          due_date: string
          household_id: string
          id?: string
          reference_month: string
          updated_at?: string
        }
        Update: {
          closing_date?: string
          closing_month?: string
          created_at?: string
          created_by?: string | null
          credit_card_id?: string
          due_date?: string
          household_id?: string
          id?: string
          reference_month?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_invoices_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_invoices_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          archived: boolean
          color: string
          created_at: string
          created_by: string | null
          household_id: string
          icon: string
          id: string
          is_default: boolean
          kind: string
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          color: string
          created_at?: string
          created_by?: string | null
          household_id: string
          icon: string
          id?: string
          is_default?: boolean
          kind: string
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          color?: string
          created_at?: string
          created_by?: string | null
          household_id?: string
          icon?: string
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_cards: {
        Row: {
          archived: boolean
          brand: string
          closing_day: number
          color: string
          created_at: string
          created_by: string | null
          default_payment_account_id: string | null
          due_day: number
          household_id: string
          id: string
          last_four: string | null
          limit_cents: number
          name: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          brand: string
          closing_day: number
          color: string
          created_at?: string
          created_by?: string | null
          default_payment_account_id?: string | null
          due_day: number
          household_id: string
          id?: string
          last_four?: string | null
          limit_cents?: number
          name: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          brand?: string
          closing_day?: number
          color?: string
          created_at?: string
          created_by?: string | null
          default_payment_account_id?: string | null
          due_day?: number
          household_id?: string
          id?: string
          last_four?: string | null
          limit_cents?: number
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_cards_default_payment_account_id_fkey"
            columns: ["default_payment_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_cards_default_payment_account_id_fkey"
            columns: ["default_payment_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "credit_cards_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          household_id: string
          id: string
          updated_at: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          household_id: string
          id?: string
          updated_at?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          household_id?: string
          id?: string
          updated_at?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "household_invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          created_at: string
          household_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      installment_plans: {
        Row: {
          category_id: string
          created_at: string
          created_by: string | null
          credit_card_id: string
          description: string
          first_closing_month: string
          first_installment_number: number
          household_id: string
          id: string
          installments_count: number
          purchase_date: string
          total_amount_cents: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by?: string | null
          credit_card_id: string
          description: string
          first_closing_month: string
          first_installment_number: number
          household_id: string
          id?: string
          installments_count: number
          purchase_date: string
          total_amount_cents: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string | null
          credit_card_id?: string
          description?: string
          first_closing_month?: string
          first_installment_number?: number
          household_id?: string
          id?: string
          installments_count?: number
          purchase_date?: string
          total_amount_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installment_plans_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installment_plans_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installment_plans_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          last_account_id: string | null
          last_credit_card_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          last_account_id?: string | null
          last_credit_card_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          last_account_id?: string | null
          last_credit_card_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_last_account_id_fkey"
            columns: ["last_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_last_account_id_fkey"
            columns: ["last_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "profiles_last_credit_card_id_fkey"
            columns: ["last_credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          amount_cents: number
          category_id: string | null
          created_at: string
          created_by: string | null
          credit_card_id: string | null
          date: string
          description: string
          destination_account_id: string | null
          external_id: string | null
          household_id: string
          id: string
          installment_number: number | null
          installment_plan_id: string | null
          invoice_id: string | null
          notes: string | null
          source: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount_cents: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_card_id?: string | null
          date: string
          description: string
          destination_account_id?: string | null
          external_id?: string | null
          household_id: string
          id?: string
          installment_number?: number | null
          installment_plan_id?: string | null
          invoice_id?: string | null
          notes?: string | null
          source?: string
          status: string
          type: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount_cents?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_card_id?: string | null
          date?: string
          description?: string
          destination_account_id?: string | null
          external_id?: string | null
          household_id?: string
          id?: string
          installment_number?: number | null
          installment_plan_id?: string | null
          invoice_id?: string | null
          notes?: string | null
          source?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_destination_account_id_fkey"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_destination_account_id_fkey"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_installment_plan_id_fkey"
            columns: ["installment_plan_id"]
            isOneToOne: false
            referencedRelation: "installment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "card_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_totals"
            referencedColumns: ["invoice_id"]
          },
        ]
      }
    }
    Views: {
      v_account_balances: {
        Row: {
          account_id: string | null
          balance_cents: number | null
          household_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      v_invoice_totals: {
        Row: {
          charges_cents: number | null
          closing_date: string | null
          closing_month: string | null
          credit_card_id: string | null
          credits_cents: number | null
          due_date: string | null
          household_id: string | null
          invoice_id: string | null
          paid_cents: number | null
          reference_month: string | null
          total_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "card_invoices_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_invoices_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_card_schedule: {
        Args: {
          p_card_id: string
          p_closing_day: number
          p_due_day: number
          p_invoices: Json
          p_moves: Json
          p_plans: Json
        }
        Returns: undefined
      }
      create_card_purchase: {
        Args: { p_card_id: string; p_plan: Json; p_rows: Json }
        Returns: string[]
      }
      create_household: { Args: { p_name: string }; Returns: string }
      create_invite: {
        Args: never
        Returns: {
          code: string
          expires_at: string
        }[]
      }
      ensure_invoice: {
        Args: {
          p_card_id: string
          p_closing_date: string
          p_closing_month: string
          p_due_date: string
          p_reference_month: string
        }
        Returns: string
      }
      is_household_member: { Args: { hid: string }; Returns: boolean }
      redeem_invite: { Args: { p_code: string }; Returns: string }
      restore_transactions: {
        Args: { p_plan: Json; p_rows: Json }
        Returns: undefined
      }
      seed_default_categories: {
        Args: { p_household_id: string }
        Returns: undefined
      }
      shares_household_with: { Args: { other: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
