import React, { useState } from 'react';
import { Search, Plus, Sparkles, BookOpen } from 'lucide-react';

export interface BookItem {
  id: string;
  title: string;
  author: string;
  category: string;
  progress: number;
  rating: number;
  coverColor: string;
  summary: string;
  pages: number;
}

const INITIAL_BOOKS: BookItem[] = [
  {
    id: 'b1',
    title: 'Designing Data-Intensive Applications',
    author: 'Martin Kleppmann',
    category: 'Engineering',
    progress: 75,
    rating: 5,
    coverColor: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
    summary: 'The definitive guide to system architecture, storage engines, and distributed data systems.',
    pages: 616,
  },
  {
    id: 'b2',
    title: 'Structure and Interpretation of Computer Programs',
    author: 'Harold Abelson & Gerald Jay Sussman',
    category: 'Computer Science',
    progress: 40,
    rating: 5,
    coverColor: 'linear-gradient(135deg, #141E30 0%, #243B55 100%)',
    summary: 'Core principles of computation, abstraction, and functional programming concepts.',
    pages: 657,
  },
  {
    id: 'b3',
    title: 'Superintelligence: Paths, Dangers, Strategies',
    author: 'Nick Bostrom',
    category: 'Artificial Intelligence',
    progress: 100,
    rating: 4,
    coverColor: 'linear-gradient(135deg, #2b1055 0%, #7597de 100%)',
    summary: 'An exploration of future AI trajectories, alignment challenges, and strategic safeguards.',
    pages: 352,
  },
  {
    id: 'b4',
    title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
    author: 'Robert C. Martin',
    category: 'Software Architecture',
    progress: 90,
    rating: 5,
    coverColor: 'linear-gradient(135deg, #232526 0%, #414345 100%)',
    summary: 'Best practices for writing readable, maintainable, and robust object-oriented code.',
    pages: 464,
  },
];

export default function BooksView({
  onAskAI,
}: {
  onAskAI?: (prompt: string) => void;
}) {
  const [books, setBooks] = useState<BookItem[]>(INITIAL_BOOKS);
  const [filter, setFilter] = useState<'all' | 'reading' | 'completed'>('all');
  const [search, setSearch] = useState('');
  const [selectedBook, setSelectedBook] = useState<BookItem | null>(INITIAL_BOOKS[0]);

  const filtered = books.filter((b) => {
    const matchSearch =
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.author.toLowerCase().includes(search.toLowerCase()) ||
      b.category.toLowerCase().includes(search.toLowerCase());
    if (filter === 'reading') return matchSearch && b.progress < 100;
    if (filter === 'completed') return matchSearch && b.progress === 100;
    return matchSearch;
  });

  return (
    <div className="nav-section-wrapper" style={{ padding: '32px 40px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '32px',
        }}
      >
        {/* Top Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <h1 style={{ fontSize: '32px', fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '2px', color: '#F5F5F5', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
              <BookOpen size={28} color="var(--accent)" /> Books & Knowledge Base
            </h1>
            <p style={{ fontSize: '14.5px', color: '#8E8E8E', margin: '6px 0 0 0', fontFamily: '"Poppins", sans-serif' }}>
              Your curated library, AI reading notes, and research summaries.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '0 16px',
                height: '42px',
                width: '280px',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
                transition: 'all 0.2s',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
            >
              <Search size={16} color="#8E8E8E" />
              <input
                type="text"
                placeholder="Search library..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#FFF',
                  fontSize: '14px',
                  width: '100%',
                  fontFamily: '"Poppins", sans-serif'
                }}
              />
            </div>

            <button
              onClick={() => {
                const title = prompt('Enter Book Title:');
                if (!title) return;
                const author = prompt('Enter Author Name:') || 'Unknown Author';
                setBooks((prev) => [
                  ...prev,
                  {
                    id: `b${Date.now()}`,
                    title,
                    author,
                    category: 'General',
                    progress: 0,
                    rating: 5,
                    coverColor: 'linear-gradient(135deg, #1f4037 0%, #99f2c8 100%)',
                    summary: 'Newly added reading material.',
                    pages: 300,
                  },
                ]);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--accent)',
                color: '#FFF',
                border: 'none',
                borderRadius: '12px',
                padding: '0 20px',
                height: '42px',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                fontFamily: '"Poppins", sans-serif',
                boxShadow: '0 4px 12px rgba(16, 163, 127, 0.25)',
                transition: 'transform 0.15s, box-shadow 0.15s'
              }}
              onMouseOver={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseOut={(e) => (e.currentTarget.style.transform = 'none')}
            >
              <Plus size={18} /> Add Book
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '12px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {(['all', 'reading', 'completed'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              style={{
                padding: '8px 20px',
                borderRadius: '30px',
                fontSize: '13.5px',
                fontFamily: '"Poppins", sans-serif',
                fontWeight: 500,
                cursor: 'pointer',
                border: '1px solid',
                borderColor: filter === tab ? 'var(--accent)' : 'transparent',
                background: filter === tab ? 'rgba(16, 163, 127, 0.1)' : 'rgba(255,255,255,0.03)',
                color: filter === tab ? 'var(--accent)' : '#B4B4B4',
                textTransform: 'capitalize',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                if (filter !== tab) e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              }}
              onMouseOut={(e) => {
                if (filter !== tab) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
              }}
            >
              {tab === 'all' ? 'All Books' : tab}
            </button>
          ))}
        </div>

        {/* Layout Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: '32px' }}>
          {/* Books List Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '20px', alignContent: 'start' }}>
            {filtered.map((b) => (
              <div
                key={b.id}
                onClick={() => setSelectedBook(b)}
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid',
                  borderColor: selectedBook?.id === b.id ? 'var(--accent)' : 'rgba(255, 255, 255, 0.06)',
                  borderRadius: '16px',
                  padding: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: selectedBook?.id === b.id ? '0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px var(--accent)' : '0 4px 12px rgba(0,0,0,0.2)',
                  backdropFilter: 'blur(10px)',
                  transform: selectedBook?.id === b.id ? 'translateY(-4px)' : 'none'
                }}
                onMouseOver={(e) => {
                   if (selectedBook?.id !== b.id) e.currentTarget.style.transform = 'translateY(-4px)';
                }}
                onMouseOut={(e) => {
                   if (selectedBook?.id !== b.id) e.currentTarget.style.transform = 'none';
                }}
              >
                <div
                  style={{
                    height: '160px',
                    borderRadius: '12px',
                    background: b.coverColor,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '16px',
                    color: '#FFF',
                    boxShadow: 'inset 0 0 40px rgba(0,0,0,0.3)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.8) 100%)' }} />
                  
                  <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', opacity: 0.9, textTransform: 'uppercase', position: 'relative', zIndex: 1, fontFamily: '"Poppins", sans-serif' }}>
                    {b.category}
                  </span>
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, lineHeight: '1.25', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                      {b.title}
                    </h3>
                    <p style={{ fontSize: '12px', opacity: 0.8, margin: '4px 0 0 0', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                      {b.author}
                    </p>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#B4B4B4', marginBottom: '8px', fontFamily: '"Poppins", sans-serif' }}>
                    <span>Reading Progress</span>
                    <span style={{ color: '#FFF', fontWeight: 500 }}>{b.progress}%</span>
                  </div>
                  <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${b.progress}%`,
                        background: b.progress === 100 ? '#22C55E' : 'var(--accent)',
                        borderRadius: '3px',
                        transition: 'width 0.5s ease-in-out'
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Selected Book Sidebar Detail */}
          {selectedBook ? (
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '24px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                height: 'fit-content',
                position: 'sticky',
                top: '0',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 16px 32px rgba(0,0,0,0.3)',
              }}
            >
              <div
                style={{
                  height: '200px',
                  borderRadius: '16px',
                  background: selectedBook.coverColor,
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  color: '#FFF',
                  boxShadow: 'inset 0 0 60px rgba(0,0,0,0.4)',
                  position: 'relative'
                }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.9) 100%)', borderRadius: '16px' }} />
                
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 600, margin: 0, textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
                    {selectedBook.title}
                  </h2>
                  <p style={{ fontSize: '13.5px', opacity: 0.9, margin: '6px 0 0 0', textShadow: '0 1px 4px rgba(0,0,0,0.6)', fontFamily: '"Poppins", sans-serif' }}>
                    By {selectedBook.author}
                  </p>
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px' }}>
                <h4 style={{ fontSize: '11px', fontWeight: 600, color: '#8E8E8E', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  AI Summary & Overview
                </h4>
                <p style={{ fontSize: '13.5px', color: '#D4D4D4', lineHeight: '1.6', margin: 0, fontFamily: '"Poppins", sans-serif' }}>
                  {selectedBook.summary}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '24px', fontSize: '13px', color: '#B4B4B4', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ display: 'block', color: '#8E8E8E', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Pages</span>
                  <span style={{ fontWeight: 600, color: '#FFF', fontSize: '15px' }}>{selectedBook.pages}</span>
                </div>
                <div style={{ flex: 2 }}>
                  <span style={{ display: 'block', color: '#8E8E8E', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Category</span>
                  <span style={{ fontWeight: 600, color: '#FFF', fontSize: '14px' }}>{selectedBook.category}</span>
                </div>
              </div>

              {onAskAI && (
                <button
                  onClick={() => onAskAI(`Summarize key insights from the book "${selectedBook.title}" by ${selectedBook.author}.`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '14px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, rgba(16, 163, 127, 0.15), rgba(16, 163, 127, 0.05))',
                    border: '1px solid rgba(16, 163, 127, 0.3)',
                    color: 'var(--accent)',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: '"Poppins", sans-serif',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(16, 163, 127, 0.25), rgba(16, 163, 127, 0.1))';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 163, 127, 0.2)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(16, 163, 127, 0.15), rgba(16, 163, 127, 0.05))';
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                  }}
                >
                  <Sparkles size={18} /> Ask Sakhi AI About Book
                </button>
              )}
            </div>
          ) : (
            <div style={{ padding: '40px', color: '#8E8E8E', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px dashed rgba(255,255,255,0.1)' }}>
              Select a book to view its AI summary and details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
