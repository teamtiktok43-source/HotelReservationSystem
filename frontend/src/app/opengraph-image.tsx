import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Hotel Reservation System";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #071018 0%, #0b1720 50%, #123746 100%)",
          color: "white",
          fontFamily: "Arial",
        }}
      >
        <div
          style={{
            width: "1020px",
            height: "450px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "32px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(15, 23, 32, 0.75)",
          }}
        >
          <div
            style={{
              width: "110px",
              height: "110px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "28px",
              background: "#155E75",
              fontSize: "56px",
              marginBottom: "28px",
            }}
          >
            🏨
          </div>

          <div
            style={{
              fontSize: "52px",
              fontWeight: 700,
              marginBottom: "14px",
            }}
          >
            Hotel Reservation System
          </div>

          <div
            style={{
              fontSize: "26px",
              color: "#9AA8B3",
            }}
          >
            Hotel Reservation Management System
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}