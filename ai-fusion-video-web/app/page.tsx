import { redirect } from "next/navigation";

export async function generateMetadata() {
  return {
    title: "融光",
  };
}

export default async function Home() {
  try {
    const response = await fetch("http://localhost:18080/api/system/init/status", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (response.ok) {
      const data = await response.json();
      if (data.code === 0 && data.data) {
        redirect(data.data.initialized ? "/login" : "/setup");
      }
    }
  } catch {
  }
  redirect("/login");
}
