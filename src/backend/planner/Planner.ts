import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { logger } from '../utils/logger';
import { ProviderManager } from '../services/ProviderManager';
import { ToolRegistry } from '../services/ToolRegistry';

// Define state structure for LangGraph using Annotation
export const AgentStateAnnotation = Annotation.Root({
  input: Annotation<string>(),
  output: Annotation<string>(),
  toolCalls: Annotation<any[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  history: Annotation<string[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
});

export type AgentState = typeof AgentStateAnnotation.State;

/**
 * The central Planner using LangGraph to orchestrate reasoning, 
 * provider routing, and tool execution.
 */
export class Planner {
  private providerManager: ProviderManager;
  private toolRegistry: ToolRegistry;
  private graph: any;

  constructor(providerManager: ProviderManager, toolRegistry: ToolRegistry) {
    this.providerManager = providerManager;
    this.toolRegistry = toolRegistry;
    logger.info('Planner initialized');
    this.setupGraph();
  }

  private setupGraph() {
    // Initialize StateGraph with Annotation and chain nodes/edges for proper TS typing
    this.graph = new StateGraph(AgentStateAnnotation)
      .addNode('reasoning', async (state) => {
        logger.info('Reasoning node executing');
        const response = await this.providerManager.generate(state.input);
        return { output: response.content };
      })
      .addEdge(START, 'reasoning')
      .addEdge('reasoning', END)
      .compile();

    logger.info('LangGraph compiled successfully');
  }

  async executePlan(input: string): Promise<string> {
    logger.info(`Executing plan for input: ${input}`);
    const initialState = {
      input,
      output: '',
      toolCalls: [],
      history: []
    };

    const finalState = await this.graph.invoke(initialState);
    return finalState.output;
  }
}
