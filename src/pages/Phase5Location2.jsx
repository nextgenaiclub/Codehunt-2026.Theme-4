import { MapPin, Camera } from 'lucide-react'

export default function Phase5Location2() {
    return (
        <div className="container" style={{ maxWidth: '700px', margin: '0 auto', padding: '60px 20px' }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                <MapPin size={54} style={{ color: '#FFD700', marginBottom: '15px' }} />
                <h1 style={{ fontFamily: 'Orbitron', fontSize: '1.6rem', marginBottom: '10px' }}>
                    Phase 5 — Location 2
                </h1>
                <p style={{ color: '#94a3b8', fontSize: '1rem' }}>
                    You made it here. Now read carefully.
                </p>
            </div>

            {/* Riddle Card */}
            <div style={{
                background: 'rgba(139, 92, 246, 0.08)',
                border: '2px solid rgba(139, 92, 246, 0.4)',
                borderRadius: '20px',
                padding: '40px 35px',
                textAlign: 'left',
                marginBottom: '35px'
            }}>
                <p style={{
                    color: '#a78bfa',
                    fontFamily: 'Orbitron',
                    fontSize: '0.8rem',
                    letterSpacing: '2px',
                    marginBottom: '28px',
                    textAlign: 'center'
                }}>
                    🧩 RIDDLE
                </p>

                {/* Stanza 1 */}
                <p style={{
                    color: '#e2e8f0',
                    fontStyle: 'italic',
                    lineHeight: '2',
                    fontSize: '1.05rem',
                    marginBottom: '24px'
                }}>
                    I am the mind behind your mission,<br />
                    &nbsp;&nbsp;Not a person, yet I lead.<br />
                    I{' '}
                    <span style={{ textDecoration: 'underline', textUnderlineOffset: '4px', fontWeight: 'bold' }}>
                        stand tall
                    </span>
                    , I wear the{' '}
                    <span style={{ textDecoration: 'underline', textUnderlineOffset: '4px', fontWeight: 'bold' }}>
                        organizing team's mark
                    </span>
                    ,<br />
                    &nbsp;&nbsp;Where ideas meet their seed.
                </p>

                {/* Stanza 2 */}
                <p style={{
                    color: '#e2e8f0',
                    fontStyle: 'italic',
                    lineHeight: '2',
                    fontSize: '1.05rem',
                    marginBottom: '0'
                }}>
                    Find me where the{' '}
                    <span style={{ textDecoration: 'underline', textUnderlineOffset: '4px', fontWeight: 'bold' }}>
                        second rise
                    </span>{' '}
                    begins,<br />
                    &nbsp;&nbsp;On the{' '}
                    <span style={{ textDecoration: 'underline', textUnderlineOffset: '4px', fontWeight: 'bold' }}>
                        floor that touches ground
                    </span>
                    .<br />
                    Capture proof that you were here —<br />
                    &nbsp;&nbsp;And your victory is found.
                </p>
            </div>

            {/* Instruction Banner */}
            <div style={{
                background: 'rgba(255, 215, 0, 0.08)',
                border: '1px solid rgba(255, 215, 0, 0.3)',
                borderRadius: '12px',
                padding: '20px 25px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '15px'
            }}>
                <Camera size={28} style={{ color: '#FFD700', flexShrink: 0, marginTop: '2px' }} />
                <p style={{ color: '#FFD700', margin: 0, lineHeight: '1.7', fontSize: '1rem' }}>
                    Solve the riddle, find the location, and{' '}
                    <strong>capture proof</strong> that you were there.
                    Then scan the QR code at that location to proceed!
                </p>
            </div>
        </div>
    )
}
