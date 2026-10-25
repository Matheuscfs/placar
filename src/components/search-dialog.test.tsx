// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResponseMeta, TeamSearchHit } from "@/lib/domain/types";
import { closeSearch, openSearch, resetSearchStore } from "@/lib/ui/search-store";
import { SearchDialog } from "./search-dialog";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const meta: ResponseMeta = { source: "espn", sources: ["espn"], fetchedAt: "2026-10-22T15:00:00Z", cache: "hit", ttlSeconds: 21600, fallback: false, missing: [], failures: [] };
const hit = (id: string, name: string, leagueName: string | null = null): TeamSearchHit => ({ team: { id: `espn:${id}`, key: name.toLowerCase(), name, shortName: name, abbr: name.slice(0, 3).toUpperCase() }, leagueName });
const ok = (hits: TeamSearchHit[]) => new Response(JSON.stringify({ data: hits, meta }), { status: 200 });

let fetchMock: ReturnType<typeof vi.fn<(url: string) => Promise<Response>>>;
let showModal: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetSearchStore();
  router.push.mockReset();
  fetchMock = vi.fn(async () => ok([]));
  vi.stubGlobal("fetch", fetchMock);
  // O jsdom não implementa <dialog> modal: simulamos só o que o componente usa.
  showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.showModal = showModal as unknown as () => void;
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const input = () => screen.getByRole("searchbox", { hidden: true });
const type = (text: string) => fireEvent.change(input(), { target: { value: text } });
const links = () => within(screen.getByRole("dialog", { hidden: true })).queryAllByRole("link", { hidden: true });

describe("busca geral (times e campeonatos)", () => {
  it("abre pelo store, com o foco no campo", () => {
    render(<SearchDialog />);
    act(() => openSearch());
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(input()).toHaveFocus();
  });

  it("Ctrl+K e / abrem a busca; / dentro de um campo de texto não", () => {
    render(<SearchDialog />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(showModal).toHaveBeenCalledTimes(1);
    act(() => closeSearch());
    const field = document.createElement("input");
    document.body.appendChild(field);
    fireEvent.keyDown(field, { key: "/" });
    expect(showModal).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: "/" });
    expect(showModal).toHaveBeenCalledTimes(2);
    field.remove();
  });

  it("com menos de 2 letras mostra a dica e não chama a API", async () => {
    render(<SearchDialog />);
    act(() => openSearch());
    type("f");
    await act(async () => void (await new Promise((r) => setTimeout(r, 350))));
    expect(screen.getByText("Digite o nome de um time ou de um campeonato.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("busca os times pela API depois de a pessoa parar de digitar, uma chamada só", async () => {
    fetchMock.mockResolvedValue(ok([hit("819", "Flamengo", "Campeonato Brasileiro Série A"), hit("20", "Flamengo-PI")]));
    render(<SearchDialog />);
    act(() => openSearch());
    type("fl");
    type("fla");
    type("flame");
    expect(screen.getByText("Buscando…")).toBeInTheDocument();
    const found = await screen.findAllByRole("link", { name: /^Flamengo/, hidden: true });
    expect(found.map((l) => l.getAttribute("href"))).toEqual(["/time/espn:819", "/time/espn:20"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/teams/search?q=flame", expect.anything());
    expect(screen.getByText("Campeonato Brasileiro Série A")).toBeInTheDocument();
  });

  it("campeonatos aparecem na hora, sem rede, e levam à tabela", () => {
    render(<SearchDialog />);
    act(() => openSearch());
    type("libertadores");
    expect(screen.getByRole("link", { name: /CONMEBOL Libertadores/, hidden: true })).toHaveAttribute("href", "/liga/libertadores");
  });

  it("sem resultado: diz o que foi buscado", async () => {
    render(<SearchDialog />);
    act(() => openSearch());
    type("xyzxyz");
    expect(await screen.findByText(/Nenhum time encontrado para “xyzxyz”/)).toBeInTheDocument();
  });

  it("erro da busca aparece como alerta", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "Fonte de dados indisponível no momento." } }), { status: 503 }));
    render(<SearchDialog />);
    act(() => openSearch());
    type("flamengo");
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Fonte de dados indisponível no momento.");
  });

  it("Enter abre o primeiro time e fecha a busca", async () => {
    fetchMock.mockResolvedValue(ok([hit("874", "Corinthians")]));
    render(<SearchDialog />);
    act(() => openSearch());
    type("corinthians");
    await screen.findByRole("link", { name: /Corinthians/, hidden: true });
    fireEvent.submit(input().closest("form")!);
    expect(router.push).toHaveBeenCalledWith("/time/espn:874");
    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute("open");
  });

  it("clicar num resultado fecha a busca e limpa o campo", async () => {
    fetchMock.mockResolvedValue(ok([hit("874", "Corinthians")]));
    render(<SearchDialog />);
    act(() => openSearch());
    type("corinthians");
    fireEvent.click(await screen.findByRole("link", { name: /Corinthians/, hidden: true }));
    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute("open");
    expect(input()).toHaveValue("");
    expect(links()).toHaveLength(0);
  });
});
