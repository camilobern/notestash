import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { TagRelationship } from '../types';

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

  useEffect(() => {
    if (!relationships.length || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 800;
    const height = 600;

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

    const link = svg.append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", d => Math.sqrt(d.value * 10));

    const node = svg.append("g")
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

    const label = svg.append("g")
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

    return () => {
      simulation.stop();
    };
  }, [relationships]);

  return (
    <div className="tag-visualization">
      <h2>Tag Relationships</h2>
      <svg
        ref={svgRef}
        width={800}
        height={600}
        style={{ border: '1px solid #ccc' }}
      />
    </div>
  );
};

export default TagVisualization;