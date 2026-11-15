import styles from './UpdateBanner.module.css'

interface UpdateBannerProps {
  onReload: () => void
}

/** Hinweis auf eine neue App-Version, wenn Neuladen gerade Eingaben verlieren würde. */
export function UpdateBanner({ onReload }: UpdateBannerProps) {
  return (
    <div className={styles.banner} role="status">
      <span>Neue Version verfügbar.</span>
      <button
        type="button"
        className={styles.button}
        aria-label="Neue Version jetzt laden"
        onClick={onReload}
      >
        Neue Version – jetzt laden
      </button>
    </div>
  )
}
