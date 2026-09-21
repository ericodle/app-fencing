// GENERATED FILE — DO NOT EDIT. Regenerate with `npm run db:types` after every
// migration. The hand-written aliases and the compile-time guards that pin the
// app's vocabularies to this schema live next door in src/types/db.ts.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          row_id: string | null
          summary: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          row_id?: string | null
          summary?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          row_id?: string | null
          summary?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_polls: {
        Row: {
          allow_guests: boolean
          closes_at: string | null
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          opens_at: string
          question: string | null
          status: string
          updated_at: string
        }
        Insert: {
          allow_guests?: boolean
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          opens_at?: string
          question?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          allow_guests?: boolean
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          opens_at?: string
          question?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "attendance_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_polls_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_responses: {
        Row: {
          arriving_at: string | null
          created_at: string
          guests: number
          id: string
          leaving_at: string | null
          member_id: string
          needs_ride: boolean
          note: string | null
          origin_label: string | null
          origin_lat: number | null
          origin_lng: number | null
          poll_id: string
          response: string
          seats_offered: number
          travel_mode: string | null
          updated_at: string
        }
        Insert: {
          arriving_at?: string | null
          created_at?: string
          guests?: number
          id?: string
          leaving_at?: string | null
          member_id: string
          needs_ride?: boolean
          note?: string | null
          origin_label?: string | null
          origin_lat?: number | null
          origin_lng?: number | null
          poll_id: string
          response: string
          seats_offered?: number
          travel_mode?: string | null
          updated_at?: string
        }
        Update: {
          arriving_at?: string | null
          created_at?: string
          guests?: number
          id?: string
          leaving_at?: string | null
          member_id?: string
          needs_ride?: boolean
          note?: string | null
          origin_label?: string | null
          origin_lat?: number | null
          origin_lng?: number | null
          poll_id?: string
          response?: string
          seats_offered?: number
          travel_mode?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_responses_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "attendance_responses_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_responses_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_responses_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "attendance_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_responses_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "attendance_tally"
            referencedColumns: ["poll_id"]
          },
        ]
      }
      booking_discounts: {
        Row: {
          booking_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          discount_id: string
          id: string
          note: string | null
          status: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          discount_id: string
          id?: string
          note?: string | null
          status?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          discount_id?: string
          id?: string
          note?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_discounts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_discounts_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "booking_discounts_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_discounts_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_discounts_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          amount_due: number
          amount_paid: number
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          loaner_kit: string[]
          member_id: string
          notes: string | null
          payer_id: string | null
          status: string
          updated_at: string
          weapon: string | null
        }
        Insert: {
          amount_due?: number
          amount_paid?: number
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          loaner_kit?: string[]
          member_id: string
          notes?: string | null
          payer_id?: string | null
          status?: string
          updated_at?: string
          weapon?: string | null
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          loaner_kit?: string[]
          member_id?: string
          notes?: string | null
          payer_id?: string | null
          status?: string
          updated_at?: string
          weapon?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "bookings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "bookings_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
        ]
      }
      bouts: {
        Row: {
          bout_number: number | null
          bout_type: string
          bouted_on: string
          competition_id: string | null
          created_at: string
          duration_s: number | null
          event_id: string | null
          fencer_id: string
          id: string
          notes: string | null
          opponent_club: string | null
          opponent_external_id: string | null
          opponent_handedness: string | null
          opponent_id: string | null
          opponent_name: string | null
          opponent_rating: string | null
          recorded_by: string | null
          result: string | null
          score_against: number
          score_for: number
          touches_to: number | null
          updated_at: string
          weapon: string
        }
        Insert: {
          bout_number?: number | null
          bout_type?: string
          bouted_on: string
          competition_id?: string | null
          created_at?: string
          duration_s?: number | null
          event_id?: string | null
          fencer_id: string
          id?: string
          notes?: string | null
          opponent_club?: string | null
          opponent_external_id?: string | null
          opponent_handedness?: string | null
          opponent_id?: string | null
          opponent_name?: string | null
          opponent_rating?: string | null
          recorded_by?: string | null
          result?: string | null
          score_against: number
          score_for: number
          touches_to?: number | null
          updated_at?: string
          weapon: string
        }
        Update: {
          bout_number?: number | null
          bout_type?: string
          bouted_on?: string
          competition_id?: string | null
          created_at?: string
          duration_s?: number | null
          event_id?: string | null
          fencer_id?: string
          id?: string
          notes?: string | null
          opponent_club?: string | null
          opponent_external_id?: string | null
          opponent_handedness?: string | null
          opponent_id?: string | null
          opponent_name?: string | null
          opponent_rating?: string | null
          recorded_by?: string | null
          result?: string | null
          score_against?: number
          score_for?: number
          touches_to?: number | null
          updated_at?: string
          weapon?: string
        }
        Relationships: [
          {
            foreignKeyName: "bouts_competition_fk"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bouts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bouts_fencer_id_fkey"
            columns: ["fencer_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "bouts_fencer_id_fkey"
            columns: ["fencer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bouts_fencer_id_fkey"
            columns: ["fencer_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bouts_opponent_id_fkey"
            columns: ["opponent_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "bouts_opponent_id_fkey"
            columns: ["opponent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bouts_opponent_id_fkey"
            columns: ["opponent_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bouts_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "bouts_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bouts_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
        ]
      }
      club_contact: {
        Row: {
          address: string | null
          email: string | null
          hours: string | null
          id: boolean
          map_query: string | null
          native_address: string | null
          phone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          email?: string | null
          hours?: string | null
          id?: boolean
          map_query?: string | null
          native_address?: string | null
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          email?: string | null
          hours?: string | null
          id?: boolean
          map_query?: string | null
          native_address?: string | null
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_contact_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "club_contact_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_contact_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
        ]
      }
      club_profile: {
        Row: {
          about: string | null
          currency: string | null
          id: boolean
          language: string | null
          mission: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          about?: string | null
          currency?: string | null
          id?: boolean
          language?: string | null
          mission?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          about?: string | null
          currency?: string | null
          id?: boolean
          language?: string | null
          mission?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_profile_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "club_profile_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_profile_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_results: {
        Row: {
          category: string | null
          competition_id: string
          created_at: string
          de_exit_round: string | null
          de_rounds_won: number | null
          entrants: number | null
          fencer_id: string
          id: string
          notes: string | null
          place: number | null
          points: number | null
          pool_bouts: number | null
          pool_indicator: number | null
          pool_touches_against: number | null
          pool_touches_for: number | null
          pool_victories: number | null
          rating_earned: string | null
          recorded_by: string | null
          seed_after_pools: number | null
          seed_before: number | null
          updated_at: string
          weapon: string
        }
        Insert: {
          category?: string | null
          competition_id: string
          created_at?: string
          de_exit_round?: string | null
          de_rounds_won?: number | null
          entrants?: number | null
          fencer_id: string
          id?: string
          notes?: string | null
          place?: number | null
          points?: number | null
          pool_bouts?: number | null
          pool_indicator?: number | null
          pool_touches_against?: number | null
          pool_touches_for?: number | null
          pool_victories?: number | null
          rating_earned?: string | null
          recorded_by?: string | null
          seed_after_pools?: number | null
          seed_before?: number | null
          updated_at?: string
          weapon: string
        }
        Update: {
          category?: string | null
          competition_id?: string
          created_at?: string
          de_exit_round?: string | null
          de_rounds_won?: number | null
          entrants?: number | null
          fencer_id?: string
          id?: string
          notes?: string | null
          place?: number | null
          points?: number | null
          pool_bouts?: number | null
          pool_indicator?: number | null
          pool_touches_against?: number | null
          pool_touches_for?: number | null
          pool_victories?: number | null
          rating_earned?: string | null
          recorded_by?: string | null
          seed_after_pools?: number | null
          seed_before?: number | null
          updated_at?: string
          weapon?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_results_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_results_fencer_id_fkey"
            columns: ["fencer_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "competition_results_fencer_id_fkey"
            columns: ["fencer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_results_fencer_id_fkey"
            columns: ["fencer_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_results_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "competition_results_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_results_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          country: string | null
          created_at: string
          end_date: string | null
          event_id: string | null
          id: string
          level: string
          location: string | null
          name: string
          organizer: string | null
          start_date: string
          url: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          end_date?: string | null
          event_id?: string | null
          id?: string
          level?: string
          location?: string | null
          name: string
          organizer?: string | null
          start_date: string
          url?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          end_date?: string | null
          event_id?: string | null
          id?: string
          level?: string
          location?: string | null
          name?: string
          organizer?: string | null
          start_date?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_channels: {
        Row: {
          active: boolean
          channel: string
          created_at: string
          handle: string | null
          id: string
          label: string
          sort_order: number
          url: string | null
        }
        Insert: {
          active?: boolean
          channel: string
          created_at?: string
          handle?: string | null
          id?: string
          label: string
          sort_order?: number
          url?: string | null
        }
        Update: {
          active?: boolean
          channel?: string
          created_at?: string
          handle?: string | null
          id?: string
          label?: string
          sort_order?: number
          url?: string | null
        }
        Relationships: []
      }
      discounts: {
        Row: {
          active: boolean
          created_at: string
          eligibility: string | null
          id: string
          kind: string
          label: string
          notes: string | null
          value: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          eligibility?: string | null
          id?: string
          kind?: string
          label: string
          notes?: string | null
          value: number
        }
        Update: {
          active?: boolean
          created_at?: string
          eligibility?: string | null
          id?: string
          kind?: string
          label?: string
          notes?: string | null
          value?: number
        }
        Relationships: []
      }
      duties: {
        Row: {
          assigned_by: string | null
          assignee_id: string
          created_at: string
          event_id: string
          id: string
          note: string | null
          role: string
        }
        Insert: {
          assigned_by?: string | null
          assignee_id: string
          created_at?: string
          event_id: string
          id?: string
          note?: string | null
          role?: string
        }
        Update: {
          assigned_by?: string | null
          assignee_id?: string
          created_at?: string
          event_id?: string
          id?: string
          note?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "duties_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "duties_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duties_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duties_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "duties_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duties_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duties_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rides: {
        Row: {
          created_at: string
          driver_id: string | null
          event_id: string
          id: string
          leaving_at: string | null
          notes: string | null
          pickup_label: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          seats: number
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          driver_id?: string | null
          event_id: string
          id?: string
          leaving_at?: string | null
          notes?: string | null
          pickup_label?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          seats: number
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          driver_id?: string | null
          event_id?: string
          id?: string
          leaving_at?: string | null
          notes?: string | null
          pickup_label?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          seats?: number
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_rides_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "event_rides_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rides_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rides_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rides_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          admin_title: string
          calendar_title: string | null
          cancel_date: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          capacity: number | null
          course_days: string[] | null
          created_at: string
          created_by: string | null
          currency: string | null
          display_title: string | null
          end_date: string | null
          end_time: string | null
          featured: boolean
          featured_image: string | null
          full_payment_deadline: string | null
          fully_booked: boolean
          id: string
          included: string | null
          is_private: boolean
          kind: string
          level: string
          meetup_open: boolean
          notes: string | null
          original_venue_id: string | null
          polls_attendance: boolean | null
          prereqs: string | null
          price: number | null
          series_id: string | null
          start_date: string | null
          start_time: string | null
          updated_at: string
          venue_id: string | null
          weapons: string[]
        }
        Insert: {
          admin_title: string
          calendar_title?: string | null
          cancel_date?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          capacity?: number | null
          course_days?: string[] | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          display_title?: string | null
          end_date?: string | null
          end_time?: string | null
          featured?: boolean
          featured_image?: string | null
          full_payment_deadline?: string | null
          fully_booked?: boolean
          id?: string
          included?: string | null
          is_private?: boolean
          kind: string
          level?: string
          meetup_open?: boolean
          notes?: string | null
          original_venue_id?: string | null
          polls_attendance?: boolean | null
          prereqs?: string | null
          price?: number | null
          series_id?: string | null
          start_date?: string | null
          start_time?: string | null
          updated_at?: string
          venue_id?: string | null
          weapons?: string[]
        }
        Update: {
          admin_title?: string
          calendar_title?: string | null
          cancel_date?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          capacity?: number | null
          course_days?: string[] | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          display_title?: string | null
          end_date?: string | null
          end_time?: string | null
          featured?: boolean
          featured_image?: string | null
          full_payment_deadline?: string | null
          fully_booked?: boolean
          id?: string
          included?: string | null
          is_private?: boolean
          kind?: string
          level?: string
          meetup_open?: boolean
          notes?: string | null
          original_venue_id?: string | null
          polls_attendance?: boolean | null
          prereqs?: string | null
          price?: number | null
          series_id?: string | null
          start_date?: string | null
          start_time?: string | null
          updated_at?: string
          venue_id?: string | null
          weapons?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_original_venue_id_fkey"
            columns: ["original_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      fitness_tests: {
        Row: {
          conditions: string | null
          created_at: string
          fencer_id: string
          id: string
          metric: string
          notes: string | null
          recorded_by: string | null
          side: string | null
          tested_on: string
          unit: string
          value: number
        }
        Insert: {
          conditions?: string | null
          created_at?: string
          fencer_id: string
          id?: string
          metric: string
          notes?: string | null
          recorded_by?: string | null
          side?: string | null
          tested_on: string
          unit: string
          value: number
        }
        Update: {
          conditions?: string | null
          created_at?: string
          fencer_id?: string
          id?: string
          metric?: string
          notes?: string | null
          recorded_by?: string | null
          side?: string | null
          tested_on?: string
          unit?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "fitness_tests_fencer_id_fkey"
            columns: ["fencer_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "fitness_tests_fencer_id_fkey"
            columns: ["fencer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fitness_tests_fencer_id_fkey"
            columns: ["fencer_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fitness_tests_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "fitness_tests_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fitness_tests_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
        ]
      }
      meetup_suggestions: {
        Row: {
          chosen: boolean
          chosen_at: string | null
          chosen_by: string | null
          computed_at: string
          created_at: string
          id: string
          lat: number
          lng: number
          max_km: number
          max_minutes: number | null
          mean_km: number
          method: string
          poll_id: string
          respondents: number
          stddev_km: number
          total_km: number
          venue_id: string | null
        }
        Insert: {
          chosen?: boolean
          chosen_at?: string | null
          chosen_by?: string | null
          computed_at?: string
          created_at?: string
          id?: string
          lat: number
          lng: number
          max_km: number
          max_minutes?: number | null
          mean_km: number
          method: string
          poll_id: string
          respondents: number
          stddev_km?: number
          total_km: number
          venue_id?: string | null
        }
        Update: {
          chosen?: boolean
          chosen_at?: string | null
          chosen_by?: string | null
          computed_at?: string
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          max_km?: number
          max_minutes?: number | null
          mean_km?: number
          method?: string
          poll_id?: string
          respondents?: number
          stddev_km?: number
          total_km?: number
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetup_suggestions_chosen_by_fkey"
            columns: ["chosen_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "meetup_suggestions_chosen_by_fkey"
            columns: ["chosen_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_suggestions_chosen_by_fkey"
            columns: ["chosen_by"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_suggestions_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "attendance_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_suggestions_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "attendance_tally"
            referencedColumns: ["poll_id"]
          },
          {
            foreignKeyName: "meetup_suggestions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      member_notes: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string
          created_at: string
          id: string
          member_id: string
          pinned: boolean
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          member_id: string
          pinned?: boolean
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          member_id?: string
          pinned?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "member_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "member_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_notes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "member_notes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_notes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          member_id: string
          read_at: string | null
          title: string
          url: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          member_id: string
          read_at?: string | null
          title: string
          url?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          member_id?: string
          read_at?: string | null
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
        ]
      }
      pass_punches: {
        Row: {
          booking_id: string | null
          created_at: string
          delta: number
          event_id: string | null
          id: string
          note: string | null
          pass_id: string
          recorded_by: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          delta?: number
          event_id?: string | null
          id?: string
          note?: string | null
          pass_id: string
          recorded_by?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          delta?: number
          event_id?: string | null
          id?: string
          note?: string | null
          pass_id?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pass_punches_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pass_punches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pass_punches_pass_id_fkey"
            columns: ["pass_id"]
            isOneToOne: false
            referencedRelation: "pass_balances"
            referencedColumns: ["pass_id"]
          },
          {
            foreignKeyName: "pass_punches_pass_id_fkey"
            columns: ["pass_id"]
            isOneToOne: false
            referencedRelation: "passes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pass_punches_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "pass_punches_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pass_punches_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
        ]
      }
      passes: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string | null
          id: string
          label: string
          member_id: string
          notes: string | null
          price_id: string | null
          sessions: number | null
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          member_id: string
          notes?: string | null
          price_id?: string | null
          sessions?: number | null
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          member_id?: string
          notes?: string | null
          price_id?: string | null
          sessions?: number | null
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "passes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "passes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "passes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passes_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "prices"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          currency: string | null
          id: string
          member_id: string
          method: string
          note: string | null
          paid_on: string
          pass_id: string | null
          payer_id: string | null
          recorded_by: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          member_id: string
          method?: string
          note?: string | null
          paid_on?: string
          pass_id?: string | null
          payer_id?: string | null
          recorded_by?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          member_id?: string
          method?: string
          note?: string | null
          paid_on?: string
          pass_id?: string | null
          payer_id?: string | null
          recorded_by?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_pass_fk"
            columns: ["pass_id"]
            isOneToOne: false
            referencedRelation: "pass_balances"
            referencedColumns: ["pass_id"]
          },
          {
            foreignKeyName: "payments_pass_fk"
            columns: ["pass_id"]
            isOneToOne: false
            referencedRelation: "passes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "payments_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
        ]
      }
      prices: {
        Row: {
          active: boolean
          amount: number
          applies_to: string[]
          created_at: string
          currency: string | null
          id: string
          label: string
          notes: string | null
          sort_order: number
          unit: string
        }
        Insert: {
          active?: boolean
          amount: number
          applies_to?: string[]
          created_at?: string
          currency?: string | null
          id?: string
          label: string
          notes?: string | null
          sort_order?: number
          unit?: string
        }
        Update: {
          active?: boolean
          amount?: number
          applies_to?: string[]
          created_at?: string
          currency?: string | null
          id?: string
          label?: string
          notes?: string | null
          sort_order?: number
          unit?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          agreed_to_terms_at: string | null
          agreed_to_terms_version: number | null
          application_submitted_at: string | null
          arm_span_cm: number | null
          avatar_url: string | null
          blade_size: string | null
          competition_notes: string | null
          contact_id: string | null
          contact_method: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          equipment_owned: string[]
          fie_licence_id: string | null
          gender: string | null
          glove_size: string | null
          grip: string | null
          handedness: string | null
          height_cm: number | null
          home_label: string | null
          home_lat: number | null
          home_lng: number | null
          id: string
          id_number: string | null
          jacket_size: string | null
          medical_notes: string | null
          name: string | null
          national_licence_id: string | null
          nationality: string | null
          nickname: string | null
          parent_account: string | null
          primary_weapon: string | null
          rating_epee: string | null
          rating_epee_year: number | null
          rating_foil: string | null
          rating_foil_year: number | null
          rating_saber: string | null
          rating_saber_year: number | null
          referee_qualification: string | null
          role: string
          seats_offered: number
          shoe_size: string | null
          started_fencing_on: string | null
          status: string
          travel_mode: string | null
          updated_at: string
          weapons: string[]
          weight_kg: number | null
        }
        Insert: {
          agreed_to_terms_at?: string | null
          agreed_to_terms_version?: number | null
          application_submitted_at?: string | null
          arm_span_cm?: number | null
          avatar_url?: string | null
          blade_size?: string | null
          competition_notes?: string | null
          contact_id?: string | null
          contact_method?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          equipment_owned?: string[]
          fie_licence_id?: string | null
          gender?: string | null
          glove_size?: string | null
          grip?: string | null
          handedness?: string | null
          height_cm?: number | null
          home_label?: string | null
          home_lat?: number | null
          home_lng?: number | null
          id: string
          id_number?: string | null
          jacket_size?: string | null
          medical_notes?: string | null
          name?: string | null
          national_licence_id?: string | null
          nationality?: string | null
          nickname?: string | null
          parent_account?: string | null
          primary_weapon?: string | null
          rating_epee?: string | null
          rating_epee_year?: number | null
          rating_foil?: string | null
          rating_foil_year?: number | null
          rating_saber?: string | null
          rating_saber_year?: number | null
          referee_qualification?: string | null
          role?: string
          seats_offered?: number
          shoe_size?: string | null
          started_fencing_on?: string | null
          status?: string
          travel_mode?: string | null
          updated_at?: string
          weapons?: string[]
          weight_kg?: number | null
        }
        Update: {
          agreed_to_terms_at?: string | null
          agreed_to_terms_version?: number | null
          application_submitted_at?: string | null
          arm_span_cm?: number | null
          avatar_url?: string | null
          blade_size?: string | null
          competition_notes?: string | null
          contact_id?: string | null
          contact_method?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          equipment_owned?: string[]
          fie_licence_id?: string | null
          gender?: string | null
          glove_size?: string | null
          grip?: string | null
          handedness?: string | null
          height_cm?: number | null
          home_label?: string | null
          home_lat?: number | null
          home_lng?: number | null
          id?: string
          id_number?: string | null
          jacket_size?: string | null
          medical_notes?: string | null
          name?: string | null
          national_licence_id?: string | null
          nationality?: string | null
          nickname?: string | null
          parent_account?: string | null
          primary_weapon?: string | null
          rating_epee?: string | null
          rating_epee_year?: number | null
          rating_foil?: string | null
          rating_foil_year?: number | null
          rating_saber?: string | null
          rating_saber_year?: number | null
          referee_qualification?: string | null
          role?: string
          seats_offered?: number
          shoe_size?: string | null
          started_fencing_on?: string | null
          status?: string
          travel_mode?: string | null
          updated_at?: string
          weapons?: string[]
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_parent_account_fkey"
            columns: ["parent_account"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "profiles_parent_account_fkey"
            columns: ["parent_account"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_parent_account_fkey"
            columns: ["parent_account"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
        ]
      }
      push_sent: {
        Row: {
          created_at: string
          event_id: string | null
          for_date: string
          id: string
          kind: string
          member_id: string
          poll_id: string | null
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          for_date: string
          id?: string
          kind: string
          member_id: string
          poll_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string | null
          for_date?: string
          id?: string
          kind?: string
          member_id?: string
          poll_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_sent_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_sent_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "push_sent_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_sent_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_sent_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "attendance_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_sent_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "attendance_tally"
            referencedColumns: ["poll_id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          member_id: string
          p256dh: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          member_id: string
          p256dh: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          member_id?: string
          p256dh?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "push_subscriptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_seats: {
        Row: {
          created_at: string
          id: string
          member_id: string
          ride_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          ride_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          ride_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_seats_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "ride_seats_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ride_seats_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ride_seats_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "event_rides"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          published_at: string | null
          version: number
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          published_at?: string | null
          version: number
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          published_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "terms_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "terms_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          notes: string | null
          owner_id: string | null
          plate: string | null
          seats: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          notes?: string | null
          owner_id?: string | null
          plate?: string | null
          seats: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          notes?: string | null
          owner_id?: string | null
          plate?: string | null
          seats?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "vehicles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          capacity: number | null
          created_at: string
          currency: string | null
          district: string | null
          has_scoring: boolean
          hourly_cost: number | null
          id: string
          indoor: boolean
          kind: string
          lat: number
          lng: number
          map_query: string | null
          name: string
          native_name: string | null
          notes: string | null
          pistes: number | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          created_at?: string
          currency?: string | null
          district?: string | null
          has_scoring?: boolean
          hourly_cost?: number | null
          id?: string
          indoor?: boolean
          kind?: string
          lat: number
          lng: number
          map_query?: string | null
          name: string
          native_name?: string | null
          notes?: string | null
          pistes?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          capacity?: number | null
          created_at?: string
          currency?: string | null
          district?: string | null
          has_scoring?: boolean
          hourly_cost?: number | null
          id?: string
          indoor?: boolean
          kind?: string
          lat?: number
          lng?: number
          map_query?: string | null
          name?: string
          native_name?: string | null
          notes?: string | null
          pistes?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      waiver_signatures: {
        Row: {
          body_snapshot: string
          created_at: string
          event_id: string | null
          guardian_name: string | null
          id: string
          member_id: string
          signed_at: string
          signed_name: string
          waiver_id: string
        }
        Insert: {
          body_snapshot: string
          created_at?: string
          event_id?: string | null
          guardian_name?: string | null
          id?: string
          member_id: string
          signed_at?: string
          signed_name: string
          waiver_id: string
        }
        Update: {
          body_snapshot?: string
          created_at?: string
          event_id?: string | null
          guardian_name?: string | null
          id?: string
          member_id?: string
          signed_at?: string
          signed_name?: string
          waiver_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiver_signatures_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_signatures_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "waiver_signatures_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_signatures_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_signatures_waiver_id_fkey"
            columns: ["waiver_id"]
            isOneToOne: false
            referencedRelation: "waivers"
            referencedColumns: ["id"]
          },
        ]
      }
      waivers: {
        Row: {
          applies_to: string[]
          body: string
          code: string
          created_at: string
          id: string
          published_at: string | null
          requires_guardian: boolean
          title: string
          version: number
        }
        Insert: {
          applies_to?: string[]
          body: string
          code: string
          created_at?: string
          id?: string
          published_at?: string | null
          requires_guardian?: boolean
          title: string
          version?: number
        }
        Update: {
          applies_to?: string[]
          body?: string
          code?: string
          created_at?: string
          id?: string
          published_at?: string | null
          requires_guardian?: boolean
          title?: string
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      attendance_tally: {
        Row: {
          event_id: string | null
          guests: number | null
          last_answer_at: string | null
          maybe: number | null
          needs_ride: number | null
          no: number | null
          poll_id: string | null
          seats_offered: number | null
          yes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_polls_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      bout_sides: {
        Row: {
          bout_id: string | null
          bout_number: number | null
          bout_type: string | null
          bouted_on: string | null
          competition_id: string | null
          duration_s: number | null
          event_id: string | null
          member_id: string | null
          mirrored: boolean | null
          notes: string | null
          opponent_club: string | null
          opponent_external_id: string | null
          opponent_handedness: string | null
          opponent_id: string | null
          opponent_name: string | null
          opponent_rating: string | null
          result: string | null
          touches_received: number | null
          touches_scored: number | null
          touches_to: number | null
          weapon: string | null
        }
        Relationships: []
      }
      member_balances: {
        Row: {
          member_id: string | null
          outstanding: number | null
          owed: number | null
          paid: number | null
        }
        Insert: {
          member_id?: string | null
          outstanding?: never
          owed?: never
          paid?: never
        }
        Update: {
          member_id?: string | null
          outstanding?: never
          owed?: never
          paid?: never
        }
        Relationships: []
      }
      pass_balances: {
        Row: {
          expired: boolean | null
          label: string | null
          member_id: string | null
          pass_id: string | null
          remaining: number | null
          sessions: number | null
          used: number | null
          valid_from: string | null
          valid_until: string | null
        }
        Relationships: [
          {
            foreignKeyName: "passes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "passes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "roster"
            referencedColumns: ["id"]
          },
        ]
      }
      roster: {
        Row: {
          arm_span_cm: number | null
          avatar_url: string | null
          created_at: string | null
          grip: string | null
          handedness: string | null
          height_cm: number | null
          home_label: string | null
          id: string | null
          name: string | null
          nickname: string | null
          primary_weapon: string | null
          rating_epee: string | null
          rating_epee_year: number | null
          rating_foil: string | null
          rating_foil_year: number | null
          rating_saber: string | null
          rating_saber_year: number | null
          referee_qualification: string | null
          role: string | null
          seats_offered: number | null
          started_fencing_on: string | null
          status: string | null
          travel_mode: string | null
          weapons: string[] | null
        }
        Insert: {
          arm_span_cm?: number | null
          avatar_url?: string | null
          created_at?: string | null
          grip?: string | null
          handedness?: string | null
          height_cm?: number | null
          home_label?: string | null
          id?: string | null
          name?: string | null
          nickname?: string | null
          primary_weapon?: string | null
          rating_epee?: string | null
          rating_epee_year?: number | null
          rating_foil?: string | null
          rating_foil_year?: number | null
          rating_saber?: string | null
          rating_saber_year?: number | null
          referee_qualification?: string | null
          role?: string | null
          seats_offered?: number | null
          started_fencing_on?: string | null
          status?: string | null
          travel_mode?: string | null
          weapons?: string[] | null
        }
        Update: {
          arm_span_cm?: number | null
          avatar_url?: string | null
          created_at?: string | null
          grip?: string | null
          handedness?: string | null
          height_cm?: number | null
          home_label?: string | null
          id?: string | null
          name?: string | null
          nickname?: string | null
          primary_weapon?: string | null
          rating_epee?: string | null
          rating_epee_year?: number | null
          rating_foil?: string | null
          rating_foil_year?: number | null
          rating_saber?: string | null
          rating_saber_year?: number | null
          referee_qualification?: string | null
          role?: string | null
          seats_offered?: number | null
          started_fencing_on?: string | null
          status?: string | null
          travel_mode?: string | null
          weapons?: string[] | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_current_terms: { Args: { p_version: number }; Returns: undefined }
      event_confirmed_count: { Args: { p_event_id: string }; Returns: number }
      event_confirmed_counts: {
        Args: { p_event_ids: string[] }
        Returns: {
          event_id: string
          n: number
        }[]
      }
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_coach_or_admin: { Args: never; Returns: boolean }
      is_end_user: { Args: never; Returns: boolean }
      is_self_or_child: { Args: { p_id: string }; Returns: boolean }
      my_parent_account: { Args: never; Returns: string }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

