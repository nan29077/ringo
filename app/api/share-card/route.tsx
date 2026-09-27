import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export function GET() {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "#f8f4ed", color: "#20212a", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", position: "absolute", width: 520, height: 520, right: -164, top: -212, borderRadius: 260, background: "#f9d9c7" }} />
      <div style={{ display: "flex", position: "absolute", width: 320, height: 320, right: 154, bottom: -194, borderRadius: 160, background: "#d8e7e2" }} />

      <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: 76, top: 58, width: 660, height: 510 }}>
        <div style={{ display: "flex", alignItems: "center", height: 68 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", width: 54, height: 54, borderRadius: 16, background: "#ed4b2e" }}>
            <div style={{ display: "flex", width: 25, height: 25, border: "5px solid white", borderRadius: 16 }} />
            <div style={{ display: "flex", position: "absolute", width: 13, height: 5, right: 9, top: 8, borderRadius: 3, background: "white", transform: "rotate(-28deg)" }} />
          </div>
          <span style={{ marginLeft: 13, color: "#ed4b2e", fontSize: 47, fontWeight: 700, letterSpacing: -3 }}>ringo</span>
        </div>
        <div style={{ display: "flex", marginTop: 73, color: "#b76b55", fontSize: 16, fontWeight: 700, letterSpacing: 3.5 }}>GOOD IDEAS LIVE HERE</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 18, fontSize: 68, lineHeight: 1.09, letterSpacing: -3.5, fontWeight: 700 }}>
          <span>Find your next</span>
          <span>creative <span style={{ color: "#ed4b2e" }}>spark.</span></span>
        </div>
        <div style={{ display: "flex", marginTop: 28, color: "#60616a", fontSize: 24, letterSpacing: -0.2 }}>Independent creators. Ideas worth keeping.</div>
        <div style={{ display: "flex", alignItems: "center", marginTop: "auto", color: "#60616a", fontSize: 18 }}>
          <span style={{ display: "flex", width: 30, height: 2, marginRight: 14, background: "#ed4b2e" }} />
          eBooks&nbsp; · &nbsp;Courses&nbsp; · &nbsp;Design&nbsp; · &nbsp;More
        </div>
      </div>

      <div style={{ display: "flex", position: "absolute", width: 325, height: 390, right: 112, top: 132, borderRadius: 26, background: "#efb698", transform: "rotate(11deg)", boxShadow: "0 22px 48px #6c362a30" }} />
      <div style={{ display: "flex", flexDirection: "column", position: "absolute", width: 325, height: 390, right: 150, top: 113, padding: 28, borderRadius: 26, background: "#fffdf9", transform: "rotate(-7deg)", boxShadow: "0 28px 62px #6c362a25" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ display: "flex", padding: "8px 12px", borderRadius: 99, background: "#f5e7e1", color: "#b15b44", fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>RINGO PICK</span>
          <span style={{ display: "flex", width: 14, height: 14, borderRadius: 7, background: "#ed4b2e" }} />
        </div>
        <div style={{ display: "flex", position: "relative", alignItems: "center", justifyContent: "center", height: 180, marginTop: 22, borderRadius: 17, background: "#e6ebe5" }}>
          <div style={{ display: "flex", position: "absolute", width: 104, height: 128, left: 38, top: 30, borderRadius: 9, background: "#f4c49c", transform: "rotate(-13deg)", boxShadow: "0 8px 20px #3f414026" }} />
          <div style={{ display: "flex", position: "absolute", width: 104, height: 128, left: 116, top: 22, borderRadius: 9, background: "#ed4b2e", transform: "rotate(12deg)", boxShadow: "0 8px 20px #3f414026" }} />
          <div style={{ display: "flex", position: "absolute", width: 45, height: 45, right: 25, bottom: 14, borderRadius: 23, background: "#fffdf9" }} />
        </div>
        <span style={{ display: "flex", marginTop: 22, color: "#22232b", fontSize: 24, fontWeight: 700 }}>Made to inspire.</span>
        <span style={{ display: "flex", marginTop: 8, color: "#81818b", fontSize: 16 }}>A little discovery goes a long way.</span>
      </div>
      <div style={{ display: "flex", position: "absolute", right: 58, bottom: 54, color: "#a17362", fontSize: 16, fontWeight: 700, letterSpacing: 1.4 }}>DISCOVER MORE  ↗</div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}
