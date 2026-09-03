import { redirect } from "next/navigation";

/** People folded into the Profile page. Keep the old route working by
 *  redirecting to the profile's People subtab. */
export default async function FriendsPage() {
  redirect("/me?tab=friends");
}
