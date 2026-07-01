// app/(dashboard)/servicios/page.tsx
import { redirect } from "next/navigation";

export default function ServiciosPage() {
	redirect("/ambientes");
}