Do the following:
You are developing a new Dynatrace Strato app. This app gives you a GUI interface for making custom topology rules in Smartscape via OpenPipeline (Smartscape edges, drawing a line from entity X to entity Y and vice versa). Those edges should be apparent in the Smartscape UI when the entity is viewed there.
Determine what agentic skills you need by reviewing the Dynatrace documentation: https://developer.dynatrace.com/, https://docs.dynatrace.com. Create these skills and persist them across sessions.
Plan your work before implementing anything. Approach the plan as a software developer with serious consideration for functionality and UI usability. Esthetics and UI friendliness are important, but functionality is equally important.
The app should discover any existing entities in the Dynatrace environment (Smartscape nodes). The user should be able to draw from one entity to another.
The app will also display existing relationships on a separate tab. You cannot delete any existing relationships (Smartscape edges), only view them. You cannot add the same edge between entities. This view should show the dynamic flow to and from nodes.
On the Smartscape nodes having topology added, show the entity details, including entity name, tags, and other relevant metadata. This will help the user see where and how the edges should be created.
Edges are bidirectional; they can go to and from a node. Make sure that is possible in the app.
After confirmation, the app will create the new OpenPipeline rules for custom topology.
User will only be able to delete those rules from OpenPipeline.
Notify me of your progress here and on the ntfy.sh topic mmm-forbidden-donut-1.

## Session Persistence
Every 1000 tokens, write a summary of current progress, 
decisions made, and next steps to MEMORY.md in this repo. 
Read MEMORY.md at the start of every session before doing 
anything else. This is how we resume after interruptions.
Notify progress to ntfy.sh topic: mmm-forbidden-donut-1
