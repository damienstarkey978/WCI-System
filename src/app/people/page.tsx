import { redirect } from "next/navigation";

/**
 * The People icon used to open one summary page here; it's now a dropdown of the three
 * directories (Internal Users, Subs/Vendors, Client Contacts). Kept as a redirect so any
 * bookmark or old link to /people lands somewhere useful.
 */
export default function PeoplePage() {
  redirect("/staff");
}
