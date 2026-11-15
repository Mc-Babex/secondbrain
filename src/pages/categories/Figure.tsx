import type { CSSProperties } from 'react'
import { pointing, REST_ROTATION, SHOULDERS, type ArmSide, type Point } from '../../lib/ring'
import styles from './Figure.module.css'

interface FigureProps {
  /** Zielpunkt in Koordinaten der Figur-ViewBox (120 × 160); `null` = Ruhehaltung. */
  pointAt: Point | null
  /** Breite in Pixeln (Höhe folgt dem Seitenverhältnis 3 : 4). */
  width?: number
}

function pivot(point: Point): CSSProperties {
  return { transformOrigin: `${point.x}px ${point.y}px` }
}

/** Figur im Mii-Stil laut `docs/figur-entwurf.svg` (ohne Hintergrund). */
export function Figure({ pointAt, width = 96 }: FigureProps) {
  const pose = pointAt ? pointing(pointAt) : null
  const armRotation = (side: ArmSide): number =>
    pose && pose.arm === side ? pose.armRotationDeg : REST_ROTATION[side]

  return (
    <svg
      className={styles.figure}
      viewBox="0 0 120 160"
      width={width}
      height={(width * 4) / 3}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="45" y="108" width="13" height="36" rx="6" fill="#3a4152" />
      <rect x="62" y="108" width="13" height="36" rx="6" fill="#3a4152" />
      <ellipse cx="51" cy="146" rx="9" ry="5" fill="#565f73" />
      <ellipse cx="69" cy="146" rx="9" ry="5" fill="#565f73" />
      <rect x="54" y="62" width="12" height="10" fill="#e9bf98" />
      <rect x="39" y="68" width="42" height="46" rx="16" fill="#7aa2f7" />
      <path
        d="M52 69 Q60 77 68 69"
        stroke="#5a7fd1"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
      <g
        id="head"
        className={styles.part}
        style={{
          ...pivot({ x: 60, y: 40 }),
          transform: `rotate(${pose ? pose.headTiltDeg : 0}deg)`,
        }}
      >
        <circle cx="34.5" cy="42" r="5" fill="#e9bf98" />
        <circle cx="85.5" cy="42" r="5" fill="#e9bf98" />
        <ellipse cx="60" cy="40" rx="25" ry="27" fill="#f1c9a5" />
        <path
          d="M35.5 33 C34.5 39 35 43 37 47 L40 34 Z M84.5 33 C85.5 39 85 43 83 47 L80 34 Z"
          fill="#4a3428"
        />
        <path
          d="M33 32 C32 12 46 5 60 5 C74 5 88 12 87 32 Z"
          fill="#2a2d33"
          stroke="#4a4f5a"
          strokeWidth=".8"
        />
        <path d="M60 7 L50 31 M60 7 L70 31" stroke="#3a3e46" strokeWidth=".9" fill="none" />
        <circle cx="47" cy="17" r="1.3" fill="none" stroke="#4a4f5a" strokeWidth=".8" />
        <circle cx="73" cy="17" r="1.3" fill="none" stroke="#4a4f5a" strokeWidth=".8" />
        <circle cx="60" cy="6.5" r="2.3" fill="#8a909c" />
        <path
          d="M44 26 C43 21 48 19 52 20 C56 18 64 18 68 20 C72 19 77 21 76 26 C76 30 70 30 66 29 C60 31 54 31 50 29 C46 30 44 29 44 26 Z"
          fill="#2a2d33"
          stroke="#e6e8ee"
          strokeWidth=".9"
        />
        <path
          d="M46.5 26 l1.5 -4 1.5 3.5 1.5 -3.5 1.5 4 M55 22 q2 -1 2 2 q0 2 -2 2.5 M59 26 l1.2 -4 1.2 4 M63 22 q-2 2 0 4 q2 0 1.5 -2 M67 26 l1 -4 M69 22 q2.5 0 2 2 q-1 2 -2 2 M72.5 24.5 q1 -2 2 0"
          stroke="#e6e8ee"
          strokeWidth=".8"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M30 31 Q60 24 90 31 Q91.5 36 86 37.5 Q60 42 34 37.5 Q28.5 36 30 31 Z"
          fill="#34383f"
          stroke="#4a4f5a"
          strokeWidth=".8"
        />
        <path d="M33 34.5 Q60 31 87 34.5" stroke="#2a2d33" strokeWidth=".8" fill="none" />
        <g
          id="eyes"
          className={styles.part}
          style={{
            transform: `translate(${pose ? pose.eyeOffset.x : 0}px, ${pose ? pose.eyeOffset.y : 0}px)`,
          }}
        >
          <ellipse cx="51" cy="44" rx="2.8" ry="4.2" fill="#1b1e26" />
          <ellipse cx="69" cy="44" rx="2.8" ry="4.2" fill="#1b1e26" />
          <circle cx="52" cy="42.3" r="1" fill="#fff" />
          <circle cx="70" cy="42.3" r="1" fill="#fff" />
        </g>
        <path
          d="M58 49.5 q2 3 4 0"
          stroke="#d9a07c"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M52 56 Q60 62 68 56"
          stroke="#b5574f"
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
        />
        <ellipse cx="44" cy="53" rx="4" ry="2.4" fill="#f7768e" opacity=".3" />
        <ellipse cx="76" cy="53" rx="4" ry="2.4" fill="#f7768e" opacity=".3" />
      </g>
      <g
        id="arm-left"
        className={`${styles.part} ${styles.arm}`}
        style={{ ...pivot(SHOULDERS.left), transform: `rotate(${armRotation('left')}deg)` }}
      >
        <rect x="36" y="72" width="12" height="38" rx="6" fill="#6b93e8" />
        <circle cx="42" cy="112" r="6.5" fill="#f1c9a5" />
      </g>
      <g
        id="arm-right"
        className={`${styles.part} ${styles.arm}`}
        style={{ ...pivot(SHOULDERS.right), transform: `rotate(${armRotation('right')}deg)` }}
      >
        <rect x="72" y="72" width="12" height="38" rx="6" fill="#6b93e8" />
        <circle cx="78" cy="112" r="6.5" fill="#f1c9a5" />
      </g>
    </svg>
  )
}
