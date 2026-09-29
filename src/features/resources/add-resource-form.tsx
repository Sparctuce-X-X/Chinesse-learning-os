"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Link2, Loader2, Type, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Kind = "VIDEO" | "ARTICLE" | "TEXT" | "DOCUMENT";

const ACCEPT = ".pdf,.docx,.txt,.md,.srt,.vtt,application/pdf,text/plain";

/** Ajout d'une ressource : vidéo YouTube, lien d'article, texte collé ou fichier (PDF, Word, texte, sous-titres). */
export function AddResourceForm() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("VIDEO");
  const [url, setUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const ready = kind === "VIDEO" ? videoUrl.trim().length > 0 : kind === "ARTICLE" ? url.trim().length > 0 : kind === "TEXT" ? text.trim().length > 0 : !!file;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    const form = new FormData();
    form.set("kind", kind);
    if (kind === "ARTICLE") form.set("url", url.trim());
    if (kind === "VIDEO") form.set("url", videoUrl.trim());
    if (kind === "TEXT") {
      form.set("text", text);
      if (title.trim()) form.set("title", title.trim());
    }
    if (kind === "DOCUMENT" && file) form.set("file", file);
    try {
      const res = await fetch("/api/resources/import", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        lessonId?: string;
        duplicateOf?: { title: string } | null;
        error?: string;
      };
      if (!res.ok || !data.lessonId) {
        setError(data.error ?? "L'import a échoué.");
        setPending(false);
        return;
      }
      const q = data.duplicateOf ? `?doublon=${encodeURIComponent(data.duplicateOf.title)}` : "";
      router.push(`/ressources/${data.lessonId}${q}`);
    } catch {
      setError("Le serveur ne répond pas. Vérifie que l'application est lancée.");
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-card p-4 sm:p-5">
      <h2 className="mb-3 font-semibold">Ajouter une ressource</h2>
      <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
        <TabsList className="mb-4">
          <TabsTrigger value="VIDEO">
            <MonitorPlay aria-hidden /> Vidéo
          </TabsTrigger>
          <TabsTrigger value="ARTICLE">
            <Link2 aria-hidden /> Lien
          </TabsTrigger>
          <TabsTrigger value="TEXT">
            <Type aria-hidden /> Texte
          </TabsTrigger>
          <TabsTrigger value="DOCUMENT">
            <FileUp aria-hidden /> Fichier
          </TabsTrigger>
        </TabsList>

        <TabsContent value="VIDEO" className="space-y-2">
          <Label htmlFor="res-video">Lien de la vidéo YouTube</Label>
          <Input
            id="res-video"
            type="url"
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=…"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Les sous-titres chinois de la vidéo sont utilisés (ceux de l&apos;auteur en priorité, sinon ceux générés par YouTube). Sans sous-titres,
            l&apos;audio est transcrit sur ton ordinateur par Whisper (compte environ 2 minutes de calcul par minute de vidéo).
          </p>
        </TabsContent>

        <TabsContent value="ARTICLE" className="space-y-2">
          <Label htmlFor="res-url">Adresse de l&apos;article</Label>
          <Input id="res-url" type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
          <p className="text-xs text-muted-foreground">
            Article, blog, page d&apos;actualité en chinois. Si le site bloque la lecture automatique, colle le texte dans l&apos;onglet « Texte ».
          </p>
        </TabsContent>

        <TabsContent value="TEXT" className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="res-text">Texte en chinois</Label>
            <Textarea
              id="res-text"
              lang="zh-CN"
              rows={7}
              placeholder="Colle ici un article, une transcription de vidéo, des paroles de chanson…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="res-title">Titre (facultatif)</Label>
            <Input id="res-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Vidéo sur les petits boulots" />
          </div>
        </TabsContent>

        <TabsContent value="DOCUMENT" className="space-y-2">
          <Label htmlFor="res-file">Fichier</Label>
          <Input id="res-file" ref={fileRef} type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <p className="text-xs text-muted-foreground">PDF, Word (.docx), texte (.txt, .md) ou sous-titres (.srt, .vtt) — 20 Mo maximum.</p>
        </TabsContent>
      </Tabs>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-4 flex items-center justify-end gap-3">
        {pending && (
          <span className="text-xs text-muted-foreground">
            {kind === "VIDEO" ? "Lecture de la vidéo et de ses sous-titres…" : kind === "ARTICLE" ? "Lecture de la page…" : "Lecture du contenu…"}
          </span>
        )}
        <Button type="submit" disabled={!ready || pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Analyser les mots
        </Button>
      </div>
    </form>
  );
}
