import React, { useState } from 'react';
import LiquidOrb from './LiquidOrb';

export const OrbDemo: React.FC = () => {
  const [orbState, setOrbState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [voiceLevel, setVoiceLevel] = useState<number>(0.4);

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#e9eaec', gap: 20 }}>
      <h2>Liquid Glass Orb Demo</h2>

      <LiquidOrb 
        size={380} 
        state={orbState} 
        voiceLevel={voiceLevel}
        onClick={() => console.log('Orb Clicked')}
      />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, background: '#ffffff', padding: 20, borderRadius: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['idle', 'listening', 'thinking', 'speaking'] as const).map(st => (
            <button
              key={st}
              onClick={() => setOrbState(st)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #D2CED8',
                background: orbState === st ? '#9D4EDD' : '#FAFAFB',
                color: orbState === st ? '#ffffff' : '#16131D',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {st}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: 300 }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#3D3847' }}>
            Voice Level: {Math.round(voiceLevel * 100)}%
          </label>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            value={voiceLevel}
            onChange={(e) => setVoiceLevel(parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>
      </div>
    </div>
  );
};

export default OrbDemo;
