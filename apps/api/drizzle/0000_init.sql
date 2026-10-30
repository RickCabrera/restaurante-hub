CREATE TYPE "public"."cash_movement_type" AS ENUM('ENTRADA', 'SALIDA');--> statement-breakpoint
CREATE TYPE "public"."conversation_type" AS ENUM('AREA_OWNER', 'GENERAL', 'REQUISITION');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('PERCENT', 'AMOUNT');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('REQUISITION_NEW', 'REQUISITION_URGENT', 'REQUISITION_UPDATED', 'RECEPTION_DIFF', 'MESSAGE', 'DEVICE_OFFLINE', 'ORDER_NEW', 'ORDER_UPDATED', 'HUMAN_HANDOFF', 'PRINT_ERROR', 'DAILY_SUMMARY');--> statement-breakpoint
CREATE TYPE "public"."order_channel" AS ENUM('WHATSAPP', 'WEB', 'TELEFONO', 'MOSTRADOR', 'MESA');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('NUEVO', 'ACEPTADO', 'EN_PREPARACION', 'LISTO', 'EN_CAMINO', 'ENTREGADO', 'RECOGIDO', 'RECHAZADO', 'CANCELADO');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('DOMICILIO', 'PASAR_A_RECOGER');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('EFECTIVO', 'TARJETA', 'TRANSFERENCIA');--> statement-breakpoint
CREATE TYPE "public"."print_job_kind" AS ENUM('KITCHEN', 'CUSTOMER', 'BILL', 'PAYMENT', 'CASH_CUT', 'TEST', 'SHOPPING_LIST');--> statement-breakpoint
CREATE TYPE "public"."print_job_status" AS ENUM('PENDING', 'SENT', 'PRINTED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."printer_connection" AS ENUM('NETWORK', 'USB_DEVICE', 'WINDOWS_PRINTER', 'SERIAL', 'BLUETOOTH', 'BROWSER', 'KDS');--> statement-breakpoint
CREATE TYPE "public"."printer_dialect" AS ENUM('ESC_POS', 'STAR');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('NORMAL', 'URGENTE');--> statement-breakpoint
CREATE TYPE "public"."requisition_status" AS ENUM('ENVIADA', 'VISTA', 'APROBADA', 'APROBADA_PARCIAL', 'RECHAZADA', 'EN_COMPRA', 'SURTIDA', 'RECIBIDA', 'CANCELADA');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('OWNER', 'ADMIN', 'AREA_LEAD', 'STAFF', 'CASHIER', 'WAITER', 'DRIVER');--> statement-breakpoint
CREATE TYPE "public"."table_status" AS ENUM('LIBRE', 'OCUPADA', 'POR_COBRAR');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('ABIERTA', 'POR_COBRAR', 'PAGADA', 'CANCELADA');--> statement-breakpoint
CREATE TYPE "public"."unit_code" AS ENUM('KG', 'G', 'L', 'ML', 'PIEZA', 'BOTE', 'CAJA', 'BOLSA', 'PAQUETE', 'GARRAFON', 'TANQUE', 'MANOJO', 'ROLLO', 'DOCENA', 'LATA', 'BOTELLA');--> statement-breakpoint
CREATE TYPE "public"."wa_direction" AS ENUM('IN', 'OUT');--> statement-breakpoint
CREATE TYPE "public"."zone_kind" AS ENUM('POLYGON', 'RADIUS');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "area" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"branch_id" text,
	"name" text NOT NULL,
	"color" text DEFAULT '#2A9D8F' NOT NULL,
	"icon" text DEFAULT 'chef' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_production" boolean DEFAULT true NOT NULL,
	"can_requisition" boolean DEFAULT true NOT NULL,
	"order_window" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"actor_name" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"data" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "branch" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"lat" double precision,
	"lng" double precision,
	"hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"closed_dates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"paused_until" timestamp with time zone,
	"pause_reason" text,
	"accepts_delivery" boolean DEFAULT true NOT NULL,
	"accepts_pickup" boolean DEFAULT true NOT NULL,
	"prep_minutes" integer DEFAULT 25 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "business" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"primary_color" text DEFAULT '#E85D04' NOT NULL,
	"accent_color" text DEFAULT '#1D3557' NOT NULL,
	"timezone" text DEFAULT 'America/Mexico_City' NOT NULL,
	"currency" text DEFAULT 'MXN' NOT NULL,
	"phone" text,
	"address" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"folio_counters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"area_id" text,
	"name" text NOT NULL,
	"purpose" text DEFAULT 'AREA' NOT NULL,
	"platform" text DEFAULT 'web' NOT NULL,
	"token_hash" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"online" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"app_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"user_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"data" jsonb,
	"read_at" timestamp with time zone,
	"pushed_at" timestamp with time zone,
	"whatsapp_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pairing_code" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"code" text NOT NULL,
	"area_id" text,
	"purpose" text DEFAULT 'AREA' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_token" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_token_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_area" (
	"user_id" text NOT NULL,
	"area_id" text NOT NULL,
	CONSTRAINT "user_area_user_id_area_id_pk" PRIMARY KEY("user_id","area_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_user" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"password_hash" text,
	"pin_hash" text,
	"role" "role" NOT NULL,
	"avatar_color" text DEFAULT '#264653' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"notification_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"type" "conversation_type" NOT NULL,
	"area_id" text,
	"requisition_id" text,
	"title" text,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_requisitionId_unique" UNIQUE("requisition_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"author_user_id" text,
	"author_device_id" text,
	"author_name" text NOT NULL,
	"author_side" text NOT NULL,
	"body" text,
	"image_url" text,
	"quick_message_id" text,
	"is_broadcast" boolean DEFAULT false NOT NULL,
	"read_by" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quick_message" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"text" text NOT NULL,
	"icon" text DEFAULT 'alert' NOT NULL,
	"urgent" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "requisition_item" (
	"id" text PRIMARY KEY NOT NULL,
	"requisition_id" text NOT NULL,
	"supply_id" text NOT NULL,
	"supply_name" text NOT NULL,
	"unit" "unit_code" NOT NULL,
	"requested_qty" double precision NOT NULL,
	"approved_qty" double precision,
	"fulfilled_qty" double precision,
	"received_qty" double precision,
	"rejected" boolean DEFAULT false NOT NULL,
	"purchased" boolean DEFAULT false NOT NULL,
	"note" text,
	"review_note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "requisition_template" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"area_id" text NOT NULL,
	"name" text NOT NULL,
	"items" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "requisition" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"folio" text NOT NULL,
	"area_id" text NOT NULL,
	"device_id" text,
	"created_by_id" text,
	"created_by_name" text,
	"client_request_id" text NOT NULL,
	"priority" "priority" DEFAULT 'NORMAL' NOT NULL,
	"status" "requisition_status" DEFAULT 'ENVIADA' NOT NULL,
	"note" text,
	"needed_for" timestamp with time zone,
	"is_late" boolean DEFAULT false NOT NULL,
	"reject_reason" text,
	"review_note" text,
	"reception_note" text,
	"has_differences" boolean DEFAULT false NOT NULL,
	"seen_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_id" text,
	"purchasing_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"delivery_days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supply" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"category_id" text NOT NULL,
	"supplier_id" text,
	"name" text NOT NULL,
	"unit" "unit_code" NOT NULL,
	"step" double precision DEFAULT 1 NOT NULL,
	"max_per_order" double precision,
	"icon" text,
	"image_url" text,
	"auto_approve" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supply_area" (
	"supply_id" text NOT NULL,
	"area_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "supply_area_supply_id_area_id_pk" PRIMARY KEY("supply_id","area_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supply_category" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'box' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "address" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"label" text,
	"text" text NOT NULL,
	"references" text,
	"neighborhood" text,
	"postal_code" text,
	"lat" double precision,
	"lng" double precision,
	"validated" boolean DEFAULT false NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coupon_use" (
	"id" text PRIMARY KEY NOT NULL,
	"coupon_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"order_id" text NOT NULL,
	"discount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_use_orderId_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coupon" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"discount_type" "discount_type" NOT NULL,
	"value" integer NOT NULL,
	"max_discount_cents" integer,
	"min_order_cents" integer DEFAULT 0 NOT NULL,
	"free_delivery" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"max_uses" integer,
	"max_uses_per_customer" integer DEFAULT 1,
	"uses_count" integer DEFAULT 0 NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"customer_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"notes" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accepted_privacy_at" timestamp with time zone,
	"orders_count" integer DEFAULT 0 NOT NULL,
	"total_spent_cents" integer DEFAULT 0 NOT NULL,
	"last_order_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_zone" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "zone_kind" DEFAULT 'RADIUS' NOT NULL,
	"polygon" jsonb,
	"radius_km" double precision,
	"color" text DEFAULT '#E76F51' NOT NULL,
	"fee_cents" integer DEFAULT 0 NOT NULL,
	"min_order_cents" integer DEFAULT 0 NOT NULL,
	"free_from_cents" integer,
	"eta_minutes" integer DEFAULT 40 NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu_category" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "modifier_group" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"min_select" integer DEFAULT 0 NOT NULL,
	"max_select" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "modifier" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_item" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"production_area_id" text,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"note" text,
	"modifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kds_done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_order" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"folio" text NOT NULL,
	"public_token" text NOT NULL,
	"channel" "order_channel" NOT NULL,
	"type" "order_type" NOT NULL,
	"status" "order_status" DEFAULT 'NUEVO' NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"address_text" text,
	"address_refs" text,
	"lat" double precision,
	"lng" double precision,
	"zone_id" text,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"delivery_fee_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"coupon_code" text,
	"promotion_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"cash_given_cents" integer,
	"paid" boolean DEFAULT false NOT NULL,
	"notes" text,
	"estimated_minutes" integer,
	"reject_reason" text,
	"cancel_reason" text,
	"driver_id" text,
	"driver_settled_at" timestamp with time zone,
	"cash_session_id" text,
	"accepted_at" timestamp with time zone,
	"preparing_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_order_publicToken_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_branch" (
	"product_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"price_cents" integer,
	"available" boolean,
	CONSTRAINT "product_branch_product_id_branch_id_pk" PRIMARY KEY("product_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_modifier_group" (
	"product_id" text NOT NULL,
	"group_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_modifier_group_product_id_group_id_pk" PRIMARY KEY("product_id","group_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"category_id" text NOT NULL,
	"production_area_id" text,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"price_cents" integer NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"show_in_web" boolean DEFAULT true NOT NULL,
	"show_in_whatsapp" boolean DEFAULT true NOT NULL,
	"show_in_qr" boolean DEFAULT true NOT NULL,
	"show_in_pos" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promotion" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"buy_qty" integer,
	"get_qty" integer,
	"min_order_cents" integer DEFAULT 0 NOT NULL,
	"product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"weekdays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"time_from" text,
	"time_to" text,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"phone" text NOT NULL,
	"customer_id" text,
	"profile_name" text,
	"state" text DEFAULT 'IDLE' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"human_mode" boolean DEFAULT false NOT NULL,
	"human_since" timestamp with time zone,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"session_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_conversation_customerId_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_message" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"direction" "wa_direction" NOT NULL,
	"wa_message_id" text,
	"kind" text NOT NULL,
	"body" text,
	"payload" jsonb,
	"status" text,
	"sent_by_user_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_message_waMessageId_unique" UNIQUE("wa_message_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_movement" (
	"id" text PRIMARY KEY NOT NULL,
	"cash_session_id" text NOT NULL,
	"type" "cash_movement_type" NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"ref_id" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_session" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"branch_id" text,
	"folio" text NOT NULL,
	"cashier_id" text NOT NULL,
	"opening_cents" integer NOT NULL,
	"counted_cents" integer,
	"expected_cents" integer,
	"difference_cents" integer,
	"notes" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dining_area" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"branch_id" text,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dining_table" (
	"id" text PRIMARY KEY NOT NULL,
	"dining_area_id" text NOT NULL,
	"name" text NOT NULL,
	"capacity" integer DEFAULT 4 NOT NULL,
	"pos_x" integer DEFAULT 0 NOT NULL,
	"pos_y" integer DEFAULT 0 NOT NULL,
	"shape" text DEFAULT 'square' NOT NULL,
	"status" "table_status" DEFAULT 'LIBRE' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pos_payment" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"cash_session_id" text,
	"method" "payment_method" NOT NULL,
	"amount_cents" integer NOT NULL,
	"tip_cents" integer DEFAULT 0 NOT NULL,
	"received_cents" integer,
	"change_cents" integer,
	"reference" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "print_agent" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'agent' NOT NULL,
	"token_hash" text NOT NULL,
	"online" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	"version" text,
	"hostname" text,
	"platform" text,
	"discovered" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_agent_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "print_job" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"printer_id" text NOT NULL,
	"agent_id" text,
	"kind" "print_job_kind" NOT NULL,
	"order_id" text,
	"ticket_id" text,
	"document" jsonb NOT NULL,
	"status" "print_job_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"printed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "printer" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"area_id" text,
	"agent_id" text,
	"name" text NOT NULL,
	"connection" "printer_connection" NOT NULL,
	"dialect" "printer_dialect" DEFAULT 'ESC_POS' NOT NULL,
	"host" text,
	"port" integer DEFAULT 9100,
	"device_path" text,
	"windows_name" text,
	"baud_rate" integer,
	"bluetooth_address" text,
	"paper_width" integer DEFAULT 80 NOT NULL,
	"copies" integer DEFAULT 1 NOT NULL,
	"cut_paper" boolean DEFAULT true NOT NULL,
	"open_drawer" boolean DEFAULT false NOT NULL,
	"prints_customer_ticket" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pos_ticket_item" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"production_area_id" text,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"modifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"is_courtesy" boolean DEFAULT false NOT NULL,
	"total_cents" integer NOT NULL,
	"sent_at" timestamp with time zone,
	"kds_done_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pos_ticket" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"folio" text NOT NULL,
	"table_id" text,
	"service_type" text DEFAULT 'MESA' NOT NULL,
	"label" text,
	"waiter_id" text,
	"guests" integer DEFAULT 1 NOT NULL,
	"status" "ticket_status" DEFAULT 'ABIERTA' NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"discount_reason" text,
	"tip_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"customer_id" text,
	"notes" text,
	"cancel_reason" text,
	"parent_id" text,
	"cash_session_id" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "area" ADD CONSTRAINT "area_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "area" ADD CONSTRAINT "area_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "branch" ADD CONSTRAINT "branch_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "device" ADD CONSTRAINT "device_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "device" ADD CONSTRAINT "device_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification" ADD CONSTRAINT "notification_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pairing_code" ADD CONSTRAINT "pairing_code_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pairing_code" ADD CONSTRAINT "pairing_code_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_area" ADD CONSTRAINT "user_area_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_area" ADD CONSTRAINT "user_area_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_user" ADD CONSTRAINT "app_user_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation" ADD CONSTRAINT "conversation_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation" ADD CONSTRAINT "conversation_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation" ADD CONSTRAINT "conversation_requisition_id_requisition_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisition"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message" ADD CONSTRAINT "message_author_user_id_app_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message" ADD CONSTRAINT "message_author_device_id_device_id_fk" FOREIGN KEY ("author_device_id") REFERENCES "public"."device"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quick_message" ADD CONSTRAINT "quick_message_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requisition_item" ADD CONSTRAINT "requisition_item_requisition_id_requisition_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisition"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requisition_item" ADD CONSTRAINT "requisition_item_supply_id_supply_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supply"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requisition_template" ADD CONSTRAINT "requisition_template_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requisition_template" ADD CONSTRAINT "requisition_template_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requisition" ADD CONSTRAINT "requisition_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requisition" ADD CONSTRAINT "requisition_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requisition" ADD CONSTRAINT "requisition_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requisition" ADD CONSTRAINT "requisition_created_by_id_app_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier" ADD CONSTRAINT "supplier_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supply" ADD CONSTRAINT "supply_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supply" ADD CONSTRAINT "supply_category_id_supply_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."supply_category"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supply" ADD CONSTRAINT "supply_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supply_area" ADD CONSTRAINT "supply_area_supply_id_supply_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supply"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supply_area" ADD CONSTRAINT "supply_area_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supply_category" ADD CONSTRAINT "supply_category_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "address" ADD CONSTRAINT "address_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coupon_use" ADD CONSTRAINT "coupon_use_coupon_id_coupon_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupon"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coupon_use" ADD CONSTRAINT "coupon_use_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coupon_use" ADD CONSTRAINT "coupon_use_order_id_delivery_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."delivery_order"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coupon" ADD CONSTRAINT "coupon_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer" ADD CONSTRAINT "customer_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_zone" ADD CONSTRAINT "delivery_zone_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_category" ADD CONSTRAINT "menu_category_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "modifier_group" ADD CONSTRAINT "modifier_group_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "modifier" ADD CONSTRAINT "modifier_group_id_modifier_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_group"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_delivery_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."delivery_order"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_item" ADD CONSTRAINT "order_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_order" ADD CONSTRAINT "delivery_order_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_order" ADD CONSTRAINT "delivery_order_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_order" ADD CONSTRAINT "delivery_order_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_order" ADD CONSTRAINT "delivery_order_driver_id_app_user_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_branch" ADD CONSTRAINT "product_branch_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_branch" ADD CONSTRAINT "product_branch_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_modifier_group" ADD CONSTRAINT "product_modifier_group_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_modifier_group" ADD CONSTRAINT "product_modifier_group_group_id_modifier_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_group"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product" ADD CONSTRAINT "product_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product" ADD CONSTRAINT "product_category_id_menu_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_category"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product" ADD CONSTRAINT "product_production_area_id_area_id_fk" FOREIGN KEY ("production_area_id") REFERENCES "public"."area"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "promotion" ADD CONSTRAINT "promotion_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_conversation" ADD CONSTRAINT "wa_conversation_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_conversation" ADD CONSTRAINT "wa_conversation_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wa_message" ADD CONSTRAINT "wa_message_conversation_id_wa_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_movement" ADD CONSTRAINT "cash_movement_cash_session_id_cash_session_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_session"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_session" ADD CONSTRAINT "cash_session_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_session" ADD CONSTRAINT "cash_session_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_session" ADD CONSTRAINT "cash_session_cashier_id_app_user_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_area" ADD CONSTRAINT "dining_area_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_area" ADD CONSTRAINT "dining_area_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_table" ADD CONSTRAINT "dining_table_dining_area_id_dining_area_id_fk" FOREIGN KEY ("dining_area_id") REFERENCES "public"."dining_area"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_payment" ADD CONSTRAINT "pos_payment_ticket_id_pos_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."pos_ticket"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_payment" ADD CONSTRAINT "pos_payment_cash_session_id_cash_session_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_session"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "print_agent" ADD CONSTRAINT "print_agent_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "print_job" ADD CONSTRAINT "print_job_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "print_job" ADD CONSTRAINT "print_job_printer_id_printer_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printer"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "print_job" ADD CONSTRAINT "print_job_agent_id_print_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."print_agent"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "print_job" ADD CONSTRAINT "print_job_order_id_delivery_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."delivery_order"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "printer" ADD CONSTRAINT "printer_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "printer" ADD CONSTRAINT "printer_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "printer" ADD CONSTRAINT "printer_agent_id_print_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."print_agent"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_ticket_item" ADD CONSTRAINT "pos_ticket_item_ticket_id_pos_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."pos_ticket"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_ticket_item" ADD CONSTRAINT "pos_ticket_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_ticket" ADD CONSTRAINT "pos_ticket_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_ticket" ADD CONSTRAINT "pos_ticket_table_id_dining_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_table"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_ticket" ADD CONSTRAINT "pos_ticket_waiter_id_app_user_id_fk" FOREIGN KEY ("waiter_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_ticket" ADD CONSTRAINT "pos_ticket_cash_session_id_cash_session_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_session"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "area_business_id_index" ON "area" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_business_id_created_at_index" ON "audit_log" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_entity_entity_id_index" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "branch_business_id_index" ON "branch" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_business_id_index" ON "device" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_user_id_read_at_index" ON "notification" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pairing_code_code_index" ON "pairing_code" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_token_user_id_index" ON "refresh_token" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "app_user_business_id_email_index" ON "app_user" USING btree ("business_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "app_user_business_id_phone_index" ON "app_user" USING btree ("business_id","phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_business_id_type_index" ON "conversation" USING btree ("business_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_conversation_id_created_at_index" ON "message" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requisition_item_requisition_id_index" ON "requisition_item" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requisition_item_supply_id_index" ON "requisition_item" USING btree ("supply_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requisition_template_area_id_index" ON "requisition_template" USING btree ("area_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "requisition_business_id_folio_index" ON "requisition" USING btree ("business_id","folio");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "requisition_business_id_client_request_id_index" ON "requisition" USING btree ("business_id","client_request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requisition_business_id_status_index" ON "requisition" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requisition_area_id_created_at_index" ON "requisition" USING btree ("area_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_business_id_index" ON "supplier" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supply_business_id_index" ON "supply" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supply_category_business_id_index" ON "supply_category" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "address_customer_id_index" ON "address" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coupon_business_id_code_index" ON "coupon" USING btree ("business_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_business_id_phone_index" ON "customer" USING btree ("business_id","phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_category_business_id_index" ON "menu_category" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_item_order_id_index" ON "order_item" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_order_business_id_folio_index" ON "delivery_order" USING btree ("business_id","folio");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_order_business_id_status_index" ON "delivery_order" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_order_business_id_created_at_index" ON "delivery_order" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_business_id_category_id_index" ON "product" USING btree ("business_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wa_conversation_business_id_phone_index" ON "wa_conversation" USING btree ("business_id","phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wa_message_conversation_id_created_at_index" ON "wa_message" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_session_business_id_folio_index" ON "cash_session" USING btree ("business_id","folio");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_payment_ticket_id_index" ON "pos_payment" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "print_job_business_id_status_index" ON "print_job" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "print_job_printer_id_status_index" ON "print_job" USING btree ("printer_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_ticket_item_ticket_id_index" ON "pos_ticket_item" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pos_ticket_business_id_folio_index" ON "pos_ticket" USING btree ("business_id","folio");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_ticket_business_id_status_index" ON "pos_ticket" USING btree ("business_id","status");