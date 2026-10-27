import { MeldMark } from "./icons";

export function SigninArt() {
  return (
    <div className="art">
      <div className="brand" style={{ padding: 0 }}>
        <MeldMark size={44} className="mark-dark" />
        <div>
          <b>MELD</b>
          <br />
          <span>Powering every step of e-commerce.</span>
        </div>
      </div>
      <div>
        <h1>One place for every order you move.</h1>
        <p>Turn WhatsApp messages into orders, close the day’s deliveries, and send each merchant what they’re owed.</p>
      </div>
      <p className="foot">MELD Logistics Company Ltd · Lagos</p>
      <MeldMark size={440} className="motif mark-dark" />
    </div>
  );
}
