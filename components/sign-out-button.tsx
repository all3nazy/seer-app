"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase";

export default function SignOutButton() {
  const [busy,setBusy]=useState(false);
  const router=useRouter();
  async function signOut(){
    setBusy(true);
    try {
      const {error}=await getSupabaseBrowserClient().auth.signOut();
      if(error) throw error;
      router.replace("/login");
      router.refresh();
    } catch {
      setBusy(false);
      alert("تعذر تسجيل الخروج. حاول مرة أخرى.");
    }
  }
  return <button type="button" disabled={busy} onClick={signOut} style={{border:"1px solid #0f5e4c",borderRadius:12,padding:"10px 14px",background:"transparent",color:"inherit",cursor:"pointer"}}>{busy?"جارٍ الخروج...":"تسجيل الخروج"}</button>;
}
