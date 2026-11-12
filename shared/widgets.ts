export type WidgetState = "draft" | "published" | "paused";
export interface Widget {
  id: string;
  name: string;
  title: string;
  greeting: string;
  accentColor: string;
  allowedOrigins: string[];
  /** Empty means all currently public materials. */
  materialIds: string[];
  state: WidgetState;
  createdAt: string;
  updatedAt: string;
  revision: number;
}
export type WidgetInput = Partial<
  Pick<
    Widget,
    | "name"
    | "title"
    | "greeting"
    | "accentColor"
    | "allowedOrigins"
    | "materialIds"
    | "state"
  >
>;
