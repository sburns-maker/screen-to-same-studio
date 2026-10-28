import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlanEditor } from "@/components/PlanEditor";
afterEach(cleanup);
it("releases the save control and exposes a failed request without falsely confirming a plan", async () => {
  const save = vi.fn().mockRejectedValue(new Error("Plan changed; reload"));
  render(
    <PlanEditor
      plan={{
        title: "Coffee",
        starts_at: "2026-10-25T18:00Z",
        date_local: "2026-10-25",
        time_local: "14:00",
        duration_minutes: 60,
        place_key: "coffee:local",
        status: "accepted",
      }}
      onSave={save}
      onCancel={() => {}}
    />,
  );
  expect(screen.queryByText("We both agreed — mark Confirmed")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Save changes"));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent("Plan changed; reload");
  await waitFor(() => expect(screen.getByText("Save changes")).not.toBeDisabled());
  expect(save).toHaveBeenCalledTimes(1);
});

it("shows known homes and makes invitation requirements visible",()=>{
  render(<PlanEditor residences={[{key:"home:user",label:"My Home",canPlan:true},{key:"home:claire",label:"Claire's home",canPlan:true},{key:"home:riley",label:"Riley's home",canPlan:false}]} plan={{title:"Movie night",starts_at:null,date_local:null,time_local:null,duration_minutes:120,place_key:null,status:"proposed"}} onSave={vi.fn()} onCancel={()=>{}}/>);
  expect(screen.getByRole("option",{name:"Claire's home"})).not.toBeDisabled();
  expect(screen.getByRole("option",{name:"Riley's home · Invitation required"})).toBeDisabled();
});
