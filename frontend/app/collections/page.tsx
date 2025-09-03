// frontend/app/collections/page.tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4">Collections</h1>
        <div className="rounded-xl border p-4 text-sm">Please sign in.</div>
      </main>
    );
  }

  const { data: cols, error } = await supabase
    .from("collections")
    .select("id, name, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4">Collections</h1>
        <div className="rounded-xl border p-4 text-sm text-red-600">
          Failed to load collections: {error.message}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Collections</h1>

      {/* Create collection */}
      <div className="rounded-xl border p-4 flex gap-2 items-center">
        <input
          id="newColName"
          placeholder="New collection name"
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
          required
        />
        <button
          id="createColBtn"
          className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5"
          title="Create new collection"
        >
          Create
        </button>
      </div>

      {/* Upload CSV */}
      <div className="rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium mb-2">Upload CSV to a collection</div>
          <div className="text-xs opacity-70">
            <span id="selectedId" className="font-mono"></span>
            <button
              id="copyIdBtn"
              className="ml-2 rounded border px-2 py-0.5 text-xs hover:bg-black/5"
              title="Copy selected collection ID"
              type="button"
            >
              Copy ID
            </button>
          </div>
        </div>

        <form id="csvForm" className="flex flex-col sm:flex-row gap-2 items-stretch">
          <select
            name="collection_id"
            id="collectionSelect"
            className="rounded-lg border px-3 py-2 text-sm"
          >
            {(cols ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            className="rounded-lg border px-3 py-2 text-sm flex-1"
          />
          <button className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5">
            Upload
          </button>
        </form>
        <div className="text-xs opacity-70 mt-2">
          CSV headers accepted: <code>name,qty</code> (also <code>quantity</code>, <code>count</code>,
          <code> owned</code>). Bare lines like <code>2,Sol Ring</code> also work.
        </div>
      </div>

      {/* Existing collections */}
      <div className="space-y-3">
        {(cols ?? []).map((c) => {
          const created = c.created_at ? new Date(c.created_at).toLocaleString() : "";
          return (
            <div key={c.id} className="rounded-xl border p-4 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-medium truncate">{c.name}</div>
                <div className="text-xs opacity-70">{created}</div>
              </div>
              {/* Future: link to detail page */}
              {/* <a href={`/collections/${c.id}`} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5">Open</a> */}
            </div>
          );
        })}
        {(cols?.length ?? 0) === 0 && (
          <div className="rounded-xl border p-4 text-sm">No collections yet.</div>
        )}
      </div>

      {/* Inline actions script */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
          (function(){
            const selectEl = document.getElementById('collectionSelect');
            const idLabel = document.getElementById('selectedId');
            const copyBtn = document.getElementById('copyIdBtn');

            function updateIdLabel(){
              const val = selectEl?.value || '';
              if(idLabel) idLabel.textContent = val ? ('ID: ' + val) : '';
            }
            selectEl?.addEventListener('change', updateIdLabel);
            updateIdLabel();

            copyBtn?.addEventListener('click', async () => {
              const val = selectEl?.value || '';
              if (!val) return;
              try {
                await navigator.clipboard.writeText(val);
                alert('Copied collection ID');
              } catch(e) {
                alert('Failed to copy');
              }
            });

            // Create new collection
            const nameInput = document.getElementById('newColName');
            const createBtn = document.getElementById('createColBtn');
            createBtn?.addEventListener('click', async () => {
              const name = nameInput?.value?.trim();
              if (!name) return alert('Enter a name');
              const res = await fetch('/api/collections/create', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ name })
              });
              const data = await res.json().catch(()=>({}));
              if (!res.ok) return alert('Error: ' + (data.error || res.status));
              location.reload();
            });

            // Upload CSV
            const csvForm = document.getElementById('csvForm');
            csvForm?.addEventListener('submit', async (e) => {
              e.preventDefault();
              const fd = new FormData(csvForm);
              const colId = fd.get('collection_id');
              const file = fd.get('file');
              if (!colId) { alert('Pick a collection'); return; }
              if (!file || (file instanceof File && file.size === 0)) {
                alert('Pick a CSV file'); return;
              }
              const res = await fetch('/api/collections/upload', { method: 'POST', body: fd });
              const data = await res.json().catch(()=>({}));
              if (!res.ok) { alert('Upload failed: ' + (data.error || res.status)); return; }
              alert('Uploaded ' + (data.inserted ?? data.count ?? 0) + ' rows');
            });
          })();
        `,
        }}
      />
    </main>
  );
}
