import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { TagRelationship } from '../types';
import { notesApi } from '../api';
import { Note } from '../types';

interface TagVisualizationProps {
  relationships: TagRelationship[];
}

interface Node extends d3.SimulationNodeDatum {
  id: string;
  group: number;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: Node;
  target: Node;
  value: number;
}

const TagVisualization: React.FC<TagVisualizationProps> = ({ relationships }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalTag, setModalTag] = React.useState<string | null>(null);
  const [modalNotes, setModalNotes] = React.useState<Note[]>([]);
  const [activeCard, setActiveCard] = React.useState<number>(0);

  useEffect(() => {
    if (!relationships.length || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 800;
    const height = 600;

    // Create a container group for all visualization elements
    const g = svg.append("g");

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    // Apply zoom behavior to SVG
    svg.call(zoom);

    // Add zoom controls
    const zoomControls = svg.append("g")
      .attr("class", "zoom-controls")
      .attr("transform", `translate(${width - 100}, 20)`);

    zoomControls.append("rect")
      .attr("width", 80)
      .attr("height", 60)
      .attr("rx", 5)
      .attr("fill", "#f0f0f0")
      .attr("stroke", "#ccc");

    zoomControls.append("text")
      .attr("x", 40)
      .attr("y", 25)
      .attr("text-anchor", "middle")
      .attr("cursor", "pointer")
      .text("+")
      .style("font-size", "20px")
      .on("click", () => {
        svg.transition()
          .duration(300)
          .call(zoom.scaleBy, 1.3);
      });

    zoomControls.append("text")
      .attr("x", 40)
      .attr("y", 50)
      .attr("text-anchor", "middle")
      .attr("cursor", "pointer")
      .text("-")
      .style("font-size", "20px")
      .on("click", () => {
        svg.transition()
          .duration(300)
          .call(zoom.scaleBy, 0.7);
      });

    const nodes: Node[] = [];
    const nodeMap = new Map<string, Node>();
    const links: Link[] = [];

    relationships.forEach((rel) => {
      if (!nodeMap.has(rel.tag1)) {
        const node: Node = { id: rel.tag1, group: 1 };
        nodes.push(node);
        nodeMap.set(rel.tag1, node);
      }
      if (!nodeMap.has(rel.tag2)) {
        const node: Node = { id: rel.tag2, group: 1 };
        nodes.push(node);
        nodeMap.set(rel.tag2, node);
      }

      const sourceNode = nodeMap.get(rel.tag1)!;
      const targetNode = nodeMap.get(rel.tag2)!;
      
      links.push({
        source: sourceNode,
        target: targetNode,
        value: rel.similarity
      });
    });

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(d => 100 / (d as Link).value))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = g.append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", d => Math.sqrt(d.value * 10));

    const node = g.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", 8)
      .attr("fill", "#69b3a2")
      .call(d3.drag<SVGCircleElement, Node>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }) as any);

    const label = g.append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text(d => d.id)
      .attr("font-size", 12)
      .attr("dx", 12)
      .attr("dy", 4);

    simulation.on("tick", () => {
      link
        .attr("x1", d => (d.source as Node).x!)
        .attr("y1", d => (d.source as Node).y!)
        .attr("x2", d => (d.target as Node).x!)
        .attr("y2", d => (d.target as Node).y!);

      node
        .attr("cx", d => d.x!)
        .attr("cy", d => d.y!);

      label
        .attr("x", d => d.x!)
        .attr("y", d => d.y!);
    });

    // Add click event to nodes
    node.on('click', async (event, d) => {
      setModalTag(d.id);
      setModalOpen(true);
      setModalNotes([]);
      setActiveCard(0);
      try {
        const notes = await notesApi.getNotesByTag(d.id);
        setModalNotes(notes);
      } catch (e) {
        setModalNotes([]);
      }
    });

    // Add double-click to reset zoom
    svg.on("dblclick.zoom", () => {
      svg.transition()
        .duration(300)
        .call(zoom.transform, d3.zoomIdentity);
    });

    return () => {
      simulation.stop();
    };
  }, [relationships]);

  return (
    <div className="tag-visualization">
      <h2>Tag Relationships</h2>
      {relationships.length === 0 ? (
        <div style={{ 
          padding: '20px', 
          textAlign: 'center', 
          background: '#f5f5f5', 
          borderRadius: '4px',
          margin: '20px 0'
        }}>
          <p>No tag relationships to display.</p>
          <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
            Click the "Calculate Tag Relationships" button above to generate the visualization.
          </p>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg
            ref={svgRef}
            width={800}
            height={600}
            style={{ border: '1px solid #ccc' }}
          />
          <div style={{ 
            position: 'absolute', 
            bottom: '10px', 
            left: '10px', 
            background: '#fff', 
            padding: '5px', 
            borderRadius: '4px',
            fontSize: '12px',
            color: '#666',
            border: '1px solid #ccc'
          }}>
            Tip: Double-click to reset zoom
          </div>
        </div>
      )}
      {modalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}
          onClick={() => setModalOpen(false)}
        >
          <div style={{
            background: '#fff',
            padding: 24,
            borderRadius: 8,
            minWidth: 400,
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 2px 16px rgba(0,0,0,0.2)'
          }}
            onClick={e => e.stopPropagation()}
          >
            <h3>Notes with tag: {modalTag}</h3>
            {modalNotes.length === 0 ? (
              <p>No notes found.</p>
            ) : (
              <div style={{
                position: 'relative',
                width: '260px',
                height: '180px',
                margin: '40px auto 20px',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {/* Left arrow */}
                {modalNotes.length > 1 && (
                  <button
                    style={{
                      position: 'absolute',
                      left: '-36px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      zIndex: 100,
                      pointerEvents: 'auto',
                      background: '#fff',
                      border: '1px solid #ccc',
                      borderRadius: '50%',
                      width: 28,
                      height: 28,
                      fontSize: 18,
                      cursor: 'pointer',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
                    }}
                    onClick={e => {
                      e.stopPropagation();
                      setActiveCard((prev) => (prev - 1 + modalNotes.length) % modalNotes.length);
                    }}
                  >
                    {'<'}
                  </button>
                )}
                {modalNotes.map((note, i) => {
                  const total = modalNotes.length;
                  const spread = Math.min(30, 7 * (total - 1)); // max 30deg spread
                  const base = -spread / 2;
                  const rotate = base + (spread / (total === 1 ? 1 : total - 1)) * i;
                  const offset = 18 + 3 * i;
                  // Bring active card to front, less rotated, and slightly scaled up
                  const isActive = i === activeCard;
                  const z = isActive ? 999 : i;
                  const scale = isActive ? 1.08 : 1;
                  const activeRotate = isActive ? 0 : rotate;
                  const activeOffset = isActive ? 0 : offset;
                  return (
                    <div
                      key={note.id}
                      style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        width: '180px',
                        minHeight: '80px',
                        background: '#fff',
                        border: '1px solid #e0e0e0',
                        borderRadius: '8px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                        padding: '12px',
                        transform: `translate(-50%, -50%) rotate(${activeRotate}deg) translateY(-${activeOffset}px) scale(${scale})`,
                        zIndex: z,
                        pointerEvents: 'auto',
                        transition: 'transform 0.3s, z-index 0s',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        cursor: isActive ? 'default' : 'pointer',
                      }}
                      onClick={() => !isActive && setActiveCard(i)}
                    >
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, wordBreak: 'break-word' }}>{note.title}</div>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4, wordBreak: 'break-word' }}>{note.tags.join(', ')}</div>
                      <div style={{ fontSize: 13, color: '#222', wordBreak: 'break-word' }}>{note.content}</div>
                    </div>
                  );
                })}
                {/* Right arrow */}
                {modalNotes.length > 1 && (
                  <button
                    style={{
                      position: 'absolute',
                      right: '-36px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      zIndex: 100,
                      pointerEvents: 'auto',
                      background: '#fff',
                      border: '1px solid #ccc',
                      borderRadius: '50%',
                      width: 28,
                      height: 28,
                      fontSize: 18,
                      cursor: 'pointer',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
                    }}
                    onClick={e => {
                      e.stopPropagation();
                      setActiveCard((prev) => (prev + 1) % modalNotes.length);
                    }}
                  >
                    {'>'}
                  </button>
                )}
              </div>
            )}
            <button onClick={() => setModalOpen(false)} style={{ marginTop: 16 }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TagVisualization;