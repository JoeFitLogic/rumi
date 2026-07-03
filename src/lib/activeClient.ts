import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export interface ActiveClientContext {
  /** The signed-in user's profile */
  viewer: Profile;
  /** The client whose data every query should use */
  activeClientId: string;
  /** Profile of the active client (same as viewer when not switched) */
  activeClient: Profile;
  /** True when an admin is viewing a client's dashboard */
  isImpersonating: boolean;
}

/**
 * Resolve which client's data the current request should show.
 *
 * Rules:
 *  - admin + ?as=<client_id>  → that client's data (validated)
 *  - va                       → linked_user_id's data
 *  - everyone else            → their own data
 *
 * The ?as= param is NEVER trusted unless the viewer is an admin —
 * this must also be enforced in every server action that accepts a
 * clientId parameter (call this helper, don't trust the client).
 */
export async function getActiveClient(
  asParam?: string | null
): Promise<ActiveClientContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: viewer } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();
  if (!viewer) return null;

  // Admin viewing a specific client
  if (viewer.role === "admin" && asParam) {
    const { data: target } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", asParam)
      .single<Profile>();

    if (target) {
      return {
        viewer,
        activeClientId: target.id,
        activeClient: target,
        isImpersonating: target.id !== viewer.id,
      };
    }
  }

  // VA accounts act on behalf of their linked client
  if (viewer.role === "va" && viewer.linked_user_id) {
    const { data: linked } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", viewer.linked_user_id)
      .single<Profile>();

    if (linked) {
      return {
        viewer,
        activeClientId: linked.id,
        activeClient: linked,
        isImpersonating: false,
      };
    }
  }

  return {
    viewer,
    activeClientId: viewer.id,
    activeClient: viewer,
    isImpersonating: false,
  };
}
