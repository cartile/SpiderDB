Spider.G = {}

Spider.graph = function(V, E) {
    let graph = Object.create( Spider.g )

    graph.edges = []
    graph.vertices = []
    graph.vertexIndex = {}

    graph.autoid = 1

    if(Array.isArray(V)) graph.addVertices(V)
    if(Array.isArray(E)) graph.addEdges(E)

    return graph
}